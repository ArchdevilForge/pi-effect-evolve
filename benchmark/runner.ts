/**
 * End-to-End Agent A/B Benchmark Runner
 *
 * Runs clean A/B comparison across:
 * - Group A: Bare Pi (-ne -ns -np -nc --no-session)
 * - Group B: Pi + Evolve (Empty Memory)
 * - Group C: Pi + Evolve (Pre-populated Warm Gold Skills)
 * - Group D: Pi + Evolve (Autonomous Learned via Train -> Held-out split)
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

// Load Tasks Catalog
function loadTasks(tasksPath: string): BenchmarkTask[] {
  return JSON.parse(Fs.readFileSync(tasksPath, "utf8"));
}

/** Execute the independent Python/Node machine verifier */
function runVerifier(verifierScript: string, workspaceDir: string): { passed: boolean; output: string } {
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

/** Execute a single Agent Run */
export async function executeAgentTask(
  task: BenchmarkTask,
  group: AgentRunResult["group"],
  repeatIndex: number,
  extensionPath: string,
  modelName?: string,
): Promise<AgentRunResult> {
  const tmpRoot = Fs.mkdtempSync(Path.join(Os.tmpdir(), `pi-bench-${task.id}-${group}-${repeatIndex}-`));
  const workDir = Path.join(tmpRoot, "workspace");
  Fs.mkdirSync(workDir, { recursive: true });

  // Copy fixture files to workspace
  const srcFixture = Path.resolve(task.fixtureDir);
  if (Fs.existsSync(srcFixture)) {
    Fs.cpSync(srcFixture, workDir, { recursive: true });
  }

  // Setup memory directory
  const memoryDir = Path.join(workDir, "skills", "evolve");
  Fs.mkdirSync(memoryDir, { recursive: true });

  // If Group C (Warm Gold), copy gold skills into memory
  if (group === "C_warm" && task.goldSkillSlug) {
    const goldSrc = Path.resolve("benchmark", "gold-skills", task.goldSkillSlug);
    if (Fs.existsSync(goldSrc)) {
      Fs.cpSync(goldSrc, Path.join(memoryDir, task.goldSkillSlug), { recursive: true });
      // Create initial index
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
        "utf8"
      );
    }
  }

  const piArgs: string[] = [
    "-ne",
    "-ns",
    "-np",
    "-nc",
    "--no-session",
    "--mode", "json",
  ];

  if (modelName) {
    piArgs.push("--model", modelName);
  }

  if (group !== "A_bare") {
    piArgs.push("-e", extensionPath);
  }

  piArgs.push("-p", task.prompt);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PI_EFFECT_EVOLVE_MODE: "conservative",
    PI_EFFECT_REQUIRE_CONFIRM: "0", // non-interactive in benchmark runner
    PI_EFFECT_ALLOW_NETWORK: "1",
    PI_EFFECT_ALLOW_HOSTS: "*",
  };

  const t0 = performance.now();
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    const proc = ChildProcess.spawnSync("pi", piArgs, {
      cwd: workDir,
      env,
      encoding: "utf8",
      timeout: 60000,
    });
    stdout = proc.stdout || "";
    stderr = proc.stderr || "";
    exitCode = proc.status ?? 0;
  } catch (err) {
    stderr = `Pi process execution error: ${String(err)}`;
    exitCode = 1;
  }

  const wallTimeMs = performance.now() - t0;
  const parsed = parsePiJsonLines(stdout);

  // Run external machine verifier
  const verifier = runVerifier(task.verifierScript, workDir);

  // Clean up tmp directory
  try {
    Fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {}

  return {
    taskId: task.id,
    family: task.family,
    group,
    repeatIndex,
    passed: verifier.passed,
    verifierOutput: verifier.output,
    wallTimeMs,
    turns: parsed.turns,
    toolCalls: parsed.toolCalls,
    toolErrors: parsed.toolErrors,
    usage: parsed.usage,
    recalledSkills: parsed.recalledSkills,
    crystallizedSkills: parsed.crystallizedSkills,
    exitCode,
    error: verifier.passed ? undefined : (verifier.output || stderr || "Failed verification"),
  };
}

/** CLI Entrypoint */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isSmoke = args.includes("--smoke");
  const repeats = isSmoke ? 1 : 3;

  console.log(`🚀 Starting Pi Procedural Memory A/B Benchmark (Repeats: ${repeats}, Smoke: ${isSmoke})`);

  // 1. Setup Fixtures
  setupBenchmarkFixtures();

  // 2. Load Tasks
  const tasks = loadTasks(Path.resolve("benchmark", "tasks.json"));
  const tasksToRun = isSmoke ? tasks.slice(0, 3) : tasks;

  const extPath = Path.resolve("dist", "src", "extension.js");
  if (!Fs.existsSync(extPath)) {
    console.error(`❌ Extension build not found at ${extPath}. Please run npm run build first.`);
    process.exit(1);
  }

  const allResults: AgentRunResult[] = [];
  const groups: AgentRunResult["group"][] = ["A_bare", "B_empty", "C_warm"];

  for (const task of tasksToRun) {
    console.log(`\n📋 Running Family: [${task.family}] Task: ${task.id}`);
    for (const group of groups) {
      for (let r = 0; r < repeats; r++) {
        process.stdout.write(`   ↳ [${group}] Trial #${r + 1}... `);
        const res = await executeAgentTask(task, group, r, extPath);
        allResults.push(res);
        console.log(res.passed ? `✅ PASS (${(res.wallTimeMs / 1000).toFixed(1)}s, ${res.toolCalls} calls)` : `❌ FAIL (${res.error?.slice(0, 40)})`);
      }
    }
  }

  // Generate and print summary
  const report = generateBenchmarkReport(allResults);
  printFormattedReportTable(report);

  // Save report to disk
  Fs.writeFileSync(".benchmark-ab-results.json", JSON.stringify(report, null, 2), "utf8");
  console.log("💾 Results saved to .benchmark-ab-results.json");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Benchmark runner failed:", err);
    process.exit(1);
  });
}
