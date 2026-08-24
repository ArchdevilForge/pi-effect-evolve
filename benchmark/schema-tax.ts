/** Small paired benchmark for extension/tool-schema overhead. */
import * as Fs from "node:fs";
import * as Path from "node:path";
import * as Os from "node:os";
import * as ChildProcess from "node:child_process";
import { performance } from "node:perf_hooks";

import { parsePiJsonLines } from "./parse-pi-events.js";

type CaseName = "S0_bare" | "S1_inactive" | "S2_recipe" | "S3_always" | "S4_deferred";
type TaxMode = "inactive" | "recipe" | "always" | "deferred";

interface TaxRun {
  case: CaseName;
  repeat: number;
  passed: boolean;
  totalTokens: number;
  toolCalls: number;
  wallTimeMs: number;
  exitCode: number;
}

const PROMPT = "Create answer.txt containing exactly the word hello, then read it to verify the contents.";
const CASES: Array<{ name: CaseName; mode?: TaxMode }> = [
  { name: "S0_bare" },
  { name: "S1_inactive", mode: "inactive" },
  { name: "S2_recipe", mode: "recipe" },
  { name: "S3_always", mode: "always" },
  { name: "S4_deferred", mode: "deferred" },
];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function seedMemory(workDir: string): void {
  const memoryDir = Path.join(workDir, "skills", "evolve", "hello-file");
  Fs.mkdirSync(memoryDir, { recursive: true });
  const now = new Date().toISOString();
  Fs.writeFileSync(Path.join(memoryDir, "SKILL.md"), "# Write and verify a text file\n\nWrite the requested content, then read the file back to verify it.\n", "utf8");
  Fs.writeFileSync(Path.join(memoryDir, "script.py"), "from pathlib import Path\nPath('answer.txt').write_text('hello')\n", "utf8");
  Fs.writeFileSync(Path.join(memoryDir, "meta.json"), JSON.stringify({
    slug: "hello-file",
    title: "Write and verify a text file",
    type: "code",
    recipe: "Write the requested content, then read the file back to verify it.",
  }, null, 2), "utf8");
  Fs.writeFileSync(Path.join(workDir, "skills", "evolve", ".index.json"), JSON.stringify({
    version: 1,
    entries: [{
      slug: "hello-file",
      title: "Write and verify a text file",
      type: "code",
      tags: ["hello", "file", "write", "verify"],
      createdAt: now,
      lastUsed: now,
      useCount: 1,
      successCount: 1,
      failureCount: 0,
      sizeBytes: 64,
      deprecated: false,
    }],
    lastPruned: now,
  }, null, 2), "utf8");
}

function runOne(name: CaseName, mode: TaxMode | undefined, repeat: number, extensionPath: string, model: string, thinking: string): TaxRun {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), `pi-schema-tax-${name}-`));
  const workDir = Path.join(root, "workspace");
  Fs.mkdirSync(workDir, { recursive: true });
  if (mode) seedMemory(workDir);

  const args = ["-ne", "-ns", "-np", "-nc", "--no-session", "--mode", "json", "--model", model, "--thinking", thinking];
  if (mode) args.push("-e", extensionPath);
  args.push("-p", PROMPT);

  const t0 = performance.now();
  const proc = ChildProcess.spawnSync("pi", args, {
    cwd: workDir,
    env: {
      ...process.env,
      PI_EFFECT_SCHEMA_TAX_MODE: mode ?? "production",
      PI_EFFECT_EVOLVE_MODE: "conservative",
      PI_EFFECT_REQUIRE_CONFIRM: "0",
      PI_EFFECT_ALLOW_NETWORK: "0",
      PI_EFFECT_ALLOW_HOSTS: "*",
    },
    encoding: "utf8",
    timeout: 60000,
  });
  const parsed = parsePiJsonLines(proc.stdout || "");
  const exitCode = proc.error || proc.status === null ? 124 : (proc.status ?? 1);
  let passed = false;
  try {
    passed = Fs.readFileSync(Path.join(workDir, "answer.txt"), "utf8").trim() === "hello";
  } catch {}

  const result: TaxRun = {
    case: name,
    repeat,
    passed: passed && exitCode === 0,
    totalTokens: parsed.usage.totalTokens,
    toolCalls: parsed.toolCalls,
    wallTimeMs: performance.now() - t0,
    exitCode,
  };
  Fs.rmSync(root, { recursive: true, force: true });
  return result;
}

export function main(): void {
  const repeats = Number(process.env.PI_SCHEMA_TAX_REPEATS ?? 3);
  const model = process.env.PI_BENCHMARK_MODEL ?? "muse-spark-1.2-contributor";
  const thinking = process.env.PI_BENCHMARK_THINKING ?? "high";
  const extensionPath = Path.resolve("dist", "src", "extension.js");
  if (!Fs.existsSync(extensionPath)) throw new Error(`Extension build not found at ${extensionPath}`);

  const raw: TaxRun[] = [];
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const c of CASES) {
      process.stdout.write(`${c.name} #${repeat + 1}... `);
      const run = runOne(c.name, c.mode, repeat, extensionPath, model, thinking);
      raw.push(run);
      console.log(`${run.passed ? "PASS" : "FAIL"} ${run.totalTokens} tokens, ${run.toolCalls} tools`);
    }
  }

  const summary = Object.fromEntries(CASES.map(({ name }) => {
    const runs = raw.filter((run) => run.case === name);
    return [name, {
      runs: runs.length,
      passRate: runs.length > 0 ? (runs.filter((run) => run.passed).length / runs.length) * 100 : 0,
      medianTotalTokens: median(runs.map((run) => run.totalTokens)),
      medianToolCalls: median(runs.map((run) => run.toolCalls)),
      medianWallTimeMs: median(runs.map((run) => run.wallTimeMs)),
    }];
  }));
  const base = summary.S0_bare as { medianTotalTokens: number; medianToolCalls: number };
  for (const [name, value] of Object.entries(summary)) {
    const item = value as { medianTotalTokens: number; medianToolCalls: number; passRate: number };
    console.log(`${name}: pass=${item.passRate.toFixed(1)}%, tokens=${item.medianTotalTokens}, tools=${item.medianToolCalls}, Δtokens=${base.medianTotalTokens > 0 ? (((item.medianTotalTokens - base.medianTotalTokens) / base.medianTotalTokens) * 100).toFixed(1) : "n/a"}%`);
  }

  Fs.writeFileSync(".schema-tax-results.json", JSON.stringify({ model, thinking, repeats, summary, raw }, null, 2), "utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
