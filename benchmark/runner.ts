/**
 * End-to-End Agent A/B Benchmark Runner
 *
 * Evaluates 4 Distinct Groups:
 * - Group A (Bare Pi): Clean baseline (-ne -ns -np -nc --no-session)
 * - Group B (Evolve Empty): Extension loaded with empty memory (measures overhead)
 * - Group C (Evolve Warm): Pre-populated with verified Gold procedural skills
 * - Group D (Evolve Learned): Two-stage (Train in auto -> extract memory -> fresh Held-out in conservative)
 */
import * as Fs from "node:fs";
import * as Path from "node:path";
import * as Os from "node:os";
import * as ChildProcess from "node:child_process";
import { performance } from "node:perf_hooks";

import { setupBenchmarkFixtures } from "./setup-fixtures.js";
import { parsePiJsonLines } from "./parse-pi-events.js";
import { generateBenchmarkReport, printFormattedReportTable } from "./report.js";
import type { BenchmarkTask, AgentRunResult } from "./types.js";

function loadTasks(tasksPath: string): BenchmarkTask[] {
  return JSON.parse(Fs.readFileSync(tasksPath, "utf8"));
}

/** Deterministic PRNG for reproducible shuffle */
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shuffleArray<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const temp = a[i]!;
    a[i] = a[j]!;
    a[j] = temp;
  }
  return a;
}

/** Execute the independent Python/Node machine verifier */
export function runVerifier(verifierScript: string, workspaceDir: string): { passed: boolean; output: string } {
  const absVerifier = Path.resolve(verifierScript);
  if (!Fs.existsSync(absVerifier)) {
    return { passed: false, output: `Verifier script not found: ${absVerifier}` };
  }

  try {
    const isPython = verifierScript.endsWith(".py");
    const cmd = isPython ? "python3" : "node";
    const res = ChildProcess.spawnSync(cmd, [absVerifier], {
      cwd: workspaceDir,
      encoding: "utf8",
      timeout: 10000,
    });

    const output = (res.stdout + "\n" + res.stderr).trim();
    const passed = res.status === 0 && output.includes("VERIFIER_PASS");
    return { passed, output };
  } catch (err) {
    return { passed: false, output: `Verifier execution error: ${String(err)}` };
  }
}

/** Read authoritative telemetry from workspace audit log */
function readWorkspaceAudit(workspaceDir: string): { recalledSkills: string[]; crystallizedSkills: string[] } {
  const auditPath = Path.join(workspaceDir, ".pi", "evolve-audit.jsonl");
  const recalled: string[] = [];
  const crystallized: string[] = [];

  if (!Fs.existsSync(auditPath)) return { recalledSkills: recalled, crystallizedSkills: crystallized };

  try {
    const lines = Fs.readFileSync(auditPath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (ev.event === "recall" && Array.isArray(ev.skills)) recalled.push(...ev.skills);
        if (ev.event === "auto_crystallize" && ev.slug) crystallized.push(ev.slug);
      } catch {}
    }
  } catch {}

  return {
    recalledSkills: Array.from(new Set(recalled)),
    crystallizedSkills: Array.from(new Set(crystallized)),
  };
}

/** Execute a single Agent Run */
export async function executeAgentTask(
  task: BenchmarkTask,
  group: AgentRunResult["group"],
  repeatIndex: number,
  extensionPath: string,
  options?: {
    modelName?: string | undefined;
    thinkingLevel?: string | undefined;
    learnedMemoryDir?: string | undefined;
    keepFailures?: boolean | undefined;
    mode?: "auto" | "conservative" | undefined;
  },
): Promise<AgentRunResult & { learnedMemoryDir?: string | undefined }> {
  const runId = `${task.id}-${group}-r${repeatIndex}-${Date.now()}`;
  const tmpRoot = Fs.mkdtempSync(Path.join(Os.tmpdir(), `pi-bench-${runId}-`));
  const workDir = Path.join(tmpRoot, "workspace");
  Fs.mkdirSync(workDir, { recursive: true });

  // 1. Copy fixture files to workspace
  const srcFixture = Path.resolve(task.fixtureDir);
  if (Fs.existsSync(srcFixture)) {
    Fs.cpSync(srcFixture, workDir, { recursive: true });
  }

  // 2. Setup memory directory
  const memoryDir = Path.join(workDir, "skills", "evolve");
  Fs.mkdirSync(memoryDir, { recursive: true });

  // Group C: Pre-populate Gold verified procedural skill
  if (group === "C_warm" && task.goldSkillSlug) {
    const goldSrc = Path.resolve("benchmark", "gold-skills", task.goldSkillSlug);
    if (Fs.existsSync(goldSrc)) {
      Fs.cpSync(goldSrc, Path.join(memoryDir, task.goldSkillSlug), { recursive: true });
      Fs.writeFileSync(
        Path.join(memoryDir, ".index.json"),
        JSON.stringify({
          version: 1,
          entries: [
            {
              slug: task.goldSkillSlug,
              title: task.goldSkillSlug,
              tags: ["gold", "procedural", task.family],
              createdAt: new Date().toISOString(),
              lastUsed: new Date().toISOString(),
              useCount: 1,
              successCount: 1,
              failureCount: 0,
              deprecated: false,
              sizeBytes: 200,
            },
          ],
          lastPruned: new Date().toISOString(),
        }, null, 2),
        "utf8",
      );
    }
  }

  // Group D: Seed with learned memory from Train stage
  if (group === "D_learned" && options?.learnedMemoryDir && Fs.existsSync(options.learnedMemoryDir)) {
    Fs.cpSync(options.learnedMemoryDir, memoryDir, { recursive: true });
  }

  // 3. Assemble CLI Arguments
  const piArgs: string[] = [
    "-ne",
    "-ns",
    "-np",
    "-nc",
    "--no-session",
    "--mode", "json",
  ];

  if (options?.modelName) {
    piArgs.push("--model", options.modelName);
  }
  if (options?.thinkingLevel) {
    piArgs.push("--thinking", options.thinkingLevel);
  }

  if (group !== "A_bare") {
    piArgs.push("-e", extensionPath);
  }

  piArgs.push("-p", task.prompt);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PI_EFFECT_EVOLVE_MODE: options?.mode ?? (group === "D_learned" ? "conservative" : "conservative"),
    PI_EFFECT_REQUIRE_CONFIRM: "0",
    PI_EFFECT_ALLOW_NETWORK: "1",
    PI_EFFECT_ALLOW_HOSTS: "*",
  };

  const t0 = performance.now();
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  let timedOut = false;

  try {
    const proc = ChildProcess.spawnSync("pi", piArgs, {
      cwd: workDir,
      env,
      encoding: "utf8",
      timeout: 60000,
    });
    stdout = proc.stdout || "";
    stderr = proc.stderr || "";

    if (proc.error || proc.status === null) {
      timedOut = true;
      exitCode = 124;
    } else {
      exitCode = proc.status;
    }
  } catch (err) {
    stderr = `Pi process error: ${String(err)}`;
    exitCode = 1;
  }

  const wallTimeMs = performance.now() - t0;
  const parsed = parsePiJsonLines(stdout);
  const audit = readWorkspaceAudit(workDir);

  // 4. Run external machine verifier
  const verifier = runVerifier(task.verifierScript, workDir);

  // 5. If Group D Train passed, preserve learned memory buffer
  let savedLearnedDir: string | undefined = undefined;
  if (options?.mode === "auto" && verifier.passed && Fs.existsSync(memoryDir)) {
    const memBuf = Fs.mkdtempSync(Path.join(Os.tmpdir(), `pi-learned-buf-${task.family}-`));
    Fs.cpSync(memoryDir, memBuf, { recursive: true });
    savedLearnedDir = memBuf;
  }

  // 6. Handle failure preservation if requested
  if (!verifier.passed && options?.keepFailures) {
    const failDump = Path.resolve("benchmark", "failures", runId);
    Fs.mkdirSync(failDump, { recursive: true });
    Fs.cpSync(workDir, Path.join(failDump, "workspace"), { recursive: true });
    Fs.writeFileSync(Path.join(failDump, "stdout.jsonl"), stdout, "utf8");
    Fs.writeFileSync(Path.join(failDump, "stderr.log"), stderr, "utf8");
    Fs.writeFileSync(Path.join(failDump, "verifier.log"), verifier.output, "utf8");
  }

  // Clean up tmp directory
  try {
    Fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {}

  return {
    taskId: task.id,
    family: task.family,
    taskClass: task.taskClass,
    group,
    repeatIndex,
    passed: verifier.passed && !timedOut,
    verifierOutput: verifier.output,
    wallTimeMs,
    turns: parsed.turns,
    toolCalls: parsed.toolCalls,
    toolErrors: parsed.toolErrors,
    usage: parsed.usage,
    recalledSkills: audit.recalledSkills,
    crystallizedSkills: audit.crystallizedSkills,
    exitCode,
    error: verifier.passed && !timedOut ? undefined : (timedOut ? "Process Timed Out (60s)" : verifier.output || stderr || "Failed"),
    learnedMemoryDir: savedLearnedDir,
  };
}

/** Main Benchmark Runner */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isSmoke = args.includes("--smoke");
  const keepFailures = args.includes("--keep-failures");
  const repeats = isSmoke ? 1 : 3;
  const seed = 20260824;
  const rand = seededRandom(seed);

  // Parse explicit model and thinking flags
  const modelArg = args.find((a) => a.startsWith("--model="))?.split("=")[1] || process.env.PI_BENCHMARK_MODEL || "muse-spark-1.2-contributor";
  const thinkingArg = args.find((a) => a.startsWith("--thinking="))?.split("=")[1] || process.env.PI_BENCHMARK_THINKING || "high";

  console.log(`🚀 Starting Paired Agent A/B Benchmark`);
  console.log(`   Model: ${modelArg} | Thinking: ${thinkingArg} | Repeats: ${repeats} | Seed: ${seed} | Smoke: ${isSmoke}`);

  // 1. Setup Deterministic Fixtures
  setupBenchmarkFixtures();

  // 2. Load Tasks Catalog
  const allTasks = loadTasks(Path.resolve("benchmark", "tasks.json"));
  const tasksToRun = isSmoke ? allTasks.slice(0, 2) : allTasks;

  const extPath = Path.resolve("dist", "src", "extension.js");
  if (!Fs.existsSync(extPath)) {
    console.error(`❌ Extension build not found at ${extPath}. Please run npm run build first.`);
    process.exit(1);
  }

  const allResults: AgentRunResult[] = [];
  const families = Array.from(new Set(tasksToRun.map((t) => t.family)));

  for (const family of families) {
    const familyTasks = tasksToRun.filter((t) => t.family === family);
    const trainTask = familyTasks.find((t) => t.type === "train");
    const heldoutTasks = familyTasks.filter((t) => t.type !== "train");

    console.log(`\n📂 [Family: ${family}] (${familyTasks.length} tasks)`);

    for (let r = 0; r < repeats; r++) {
      let learnedMemoryDir: string | undefined = undefined;
      let trainMeta: { passed: boolean; cost: number; inputTokens: number; totalTokens: number; toolCalls: number; crystallizedCount: number; wallTimeMs: number; learnedSlugs: string[] } | undefined = undefined;

      // Train once per family/repeat, then reuse the learned memory for both held-out tasks.
      if (trainTask) {
        process.stdout.write(`     ↳ [D_learned: Step 1 Train (#${r + 1})]... `);
        const trainRes = await executeAgentTask(trainTask, "D_learned", r, extPath, {
          modelName: modelArg,
          thinkingLevel: thinkingArg,
          mode: "auto",
          keepFailures,
        });
        learnedMemoryDir = trainRes.learnedMemoryDir;
        trainMeta = {
          passed: trainRes.passed,
          cost: trainRes.usage.cost,
          inputTokens: trainRes.usage.inputTokens,
          totalTokens: trainRes.usage.totalTokens,
          toolCalls: trainRes.toolCalls,
          crystallizedCount: trainRes.crystallizedSkills.length,
          wallTimeMs: trainRes.wallTimeMs,
          learnedSlugs: trainRes.crystallizedSkills,
        };
        console.log(trainRes.passed ? `✅ Train Ok (${(trainRes.wallTimeMs / 1000).toFixed(1)}s, ${trainRes.crystallizedSkills.length} skills crystallized)` : `⚠️ Train Failed`);
      }

      for (const heldout of heldoutTasks) {
        console.log(`  🎯 Held-out Task: ${heldout.id}`);

        // --- Randomized A/B/C/D Execution on Held-out ---
        const groupsToTest: AgentRunResult["group"][] = ["A_bare", "B_empty", "C_warm", "D_learned"];
        const randomizedGroups = shuffleArray(groupsToTest, rand);

        for (const grp of randomizedGroups) {
          process.stdout.write(`     ↳ [${grp} Held-out Trial #${r + 1}]... `);
          const res = await executeAgentTask(heldout, grp, r, extPath, {
            modelName: modelArg,
            thinkingLevel: thinkingArg,
            mode: "conservative",
            learnedMemoryDir: grp === "D_learned" ? learnedMemoryDir : undefined,
            keepFailures,
          });

          if (grp === "D_learned" && trainMeta) {
            res.trainPassed = trainMeta.passed;
            res.trainCost = trainMeta.cost;
            res.trainInputTokens = trainMeta.inputTokens;
            res.trainTotalTokens = trainMeta.totalTokens;
            res.trainToolCalls = trainMeta.toolCalls;
            res.trainCrystallizedCount = trainMeta.crystallizedCount;
            res.trainWallTimeMs = trainMeta.wallTimeMs;
            res.trainTaskId = trainTask?.id;
            res.trainRunKey = `${family}|${r}`;
            res.heldoutRecalledLearnedSkill = res.recalledSkills.some((s) => trainMeta?.learnedSlugs.includes(s));
          }

          allResults.push(res);
          console.log(res.passed ? `✅ PASS (${(res.wallTimeMs / 1000).toFixed(1)}s, ${res.toolCalls} tools)` : `❌ FAIL (${res.error?.slice(0, 30)})`);
        }
      }

      if (learnedMemoryDir) {
        try { Fs.rmSync(learnedMemoryDir, { recursive: true, force: true }); } catch {}
      }
    }
  }

  // 3. Generate Report
  const report = generateBenchmarkReport(allResults, modelArg, thinkingArg, seed);
  printFormattedReportTable(report);

  // 4. Save Raw Results
  Fs.writeFileSync(".benchmark-ab-results.json", JSON.stringify({ seed, model: modelArg, thinking: thinkingArg, report, raw: allResults }, null, 2), "utf8");
  console.log("💾 Raw benchmark data and report saved to .benchmark-ab-results.json");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Benchmark runner failed:", err);
    process.exit(1);
  });
}
