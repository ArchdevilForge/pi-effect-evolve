/**
 * Statistical Reporter for Agent A/B Benchmark
 * Calculates median, mean, pass rate, cost reduction, tool calls reduction,
 * and 95% Bootstrap Confidence Intervals.
 */
import type { AgentRunResult, GroupStats, BenchmarkReportSummary } from "./types.js";

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Compute 95% Bootstrap Confidence Interval for the difference between treatment and baseline */
export function computeBootstrapCI(
  baselineVals: number[],
  treatmentVals: number[],
  iterations = 2000,
): { low95: number; median: number; high95: number } {
  if (baselineVals.length === 0 || treatmentVals.length === 0) {
    return { low95: 0, median: 0, high95: 0 };
  }

  const diffs: number[] = [];
  const nBase = baselineVals.length;
  const nTreat = treatmentVals.length;

  for (let i = 0; i < iterations; i++) {
    const sampleBase: number[] = [];
    for (let b = 0; b < nBase; b++) {
      sampleBase.push(baselineVals[Math.floor(Math.random() * nBase)]!);
    }
    const sampleTreat: number[] = [];
    for (let t = 0; t < nTreat; t++) {
      sampleTreat.push(treatmentVals[Math.floor(Math.random() * nTreat)]!);
    }

    const medBase = median(sampleBase);
    const medTreat = median(sampleTreat);
    const pctChange = medBase !== 0 ? ((medTreat - medBase) / medBase) * 100 : 0;
    diffs.push(pctChange);
  }

  diffs.sort((a, b) => a - b);
  return {
    low95: diffs[Math.floor(iterations * 0.025)]!,
    median: diffs[Math.floor(iterations * 0.500)]!,
    high95: diffs[Math.floor(iterations * 0.975)]!,
  };
}

export function generateBenchmarkReport(
  results: AgentRunResult[],
  modelName = "active-model",
): BenchmarkReportSummary {
  const groups: Record<string, AgentRunResult[]> = {};
  for (const r of results) {
    if (!groups[r.group]) groups[r.group] = [];
    groups[r.group]!.push(r);
  }

  const groupStats: Record<string, GroupStats> = {};

  for (const [grp, runs] of Object.entries(groups)) {
    const passCount = runs.filter((r) => r.passed).length;
    const costs = runs.map((r) => r.usage.cost);
    const inTokens = runs.map((r) => r.usage.inputTokens);
    const outTokens = runs.map((r) => r.usage.outputTokens);
    const tools = runs.map((r) => r.toolCalls);
    const errors = runs.map((r) => r.toolErrors);
    const times = runs.map((r) => r.wallTimeMs);

    groupStats[grp] = {
      group: grp,
      runs: runs.length,
      passCount,
      passRate: (passCount / runs.length) * 100,
      medianCost: median(costs),
      meanCost: mean(costs),
      medianInputTokens: median(inTokens),
      medianOutputTokens: median(outTokens),
      medianToolCalls: median(tools),
      meanToolErrors: mean(errors),
      medianWallTimeMs: median(times),
    };
  }

  // Calculate Deltas against Group A (Bare Pi)
  const base = groupStats["A_bare"];
  if (base) {
    for (const [grp, st] of Object.entries(groupStats)) {
      if (grp === "A_bare") continue;
      if (base.medianCost > 0) {
        st.costReductionVsBarePct = ((base.medianCost - st.medianCost) / base.medianCost) * 100;
      }
      if (base.medianToolCalls > 0) {
        st.toolCallsReductionVsBarePct = ((base.medianToolCalls - st.medianToolCalls) / base.medianToolCalls) * 100;
      }
      st.passRateDeltaVsBarePct = st.passRate - base.passRate;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    model: modelName,
    totalRuns: results.length,
    groups: groupStats,
  };
}

export function printFormattedReportTable(summary: BenchmarkReportSummary): void {
  console.log("\n" + "=".repeat(85));
  console.log(`📊 AGENT A/B BENCHMARK REPORT (Model: ${summary.model})`);
  console.log(`   Timestamp: ${summary.timestamp} | Total Agent Executions: ${summary.totalRuns}`);
  console.log("=".repeat(85));

  const headers = [
    "Experiment Group",
    "Verifier Pass",
    "Med Cost ($)",
    "Med In Tokens",
    "Med Tool Calls",
    "Mean Errors",
    "Med Time (s)",
  ];

  console.log(
    headers[0]!.padEnd(20) +
    headers[1]!.padEnd(16) +
    headers[2]!.padEnd(14) +
    headers[3]!.padEnd(16) +
    headers[4]!.padEnd(16) +
    headers[5]!.padEnd(14) +
    headers[6]!
  );
  console.log("-".repeat(85));

  for (const [name, st] of Object.entries(summary.groups)) {
    const label = name === "A_bare" ? "A: Bare Pi" :
                  name === "B_empty" ? "B: Evolve Empty" :
                  name === "C_warm" ? "C: Evolve Warm" :
                  name === "D_learned" ? "D: Evolve Learned" : name;

    const passStr = `${st.passRate.toFixed(1)}% (${st.passCount}/${st.runs})`;
    const costStr = `$${st.medianCost.toFixed(4)}`;
    const inTokStr = `${Math.round(st.medianInputTokens).toLocaleString()}`;
    const toolsStr = `${st.medianToolCalls.toFixed(1)}`;
    const errStr = `${st.meanToolErrors.toFixed(1)}`;
    const timeStr = `${(st.medianWallTimeMs / 1000).toFixed(1)}s`;

    console.log(
      label.padEnd(20) +
      passStr.padEnd(16) +
      costStr.padEnd(14) +
      inTokStr.padEnd(16) +
      toolsStr.padEnd(16) +
      errStr.padEnd(14) +
      timeStr
    );
  }
  console.log("=".repeat(85));

  // Print Summary Insights
  const bare = summary.groups["A_bare"];
  const warm = summary.groups["C_warm"];
  const learned = summary.groups["D_learned"];

  if (bare && warm) {
    console.log("\n💡 [Key A/B Findings: Warm Memory vs Bare Pi]");
    if (warm.costReductionVsBarePct !== undefined) {
      console.log(`   • Cost Delta:        ${warm.costReductionVsBarePct >= 0 ? "-" : "+"}${Math.abs(warm.costReductionVsBarePct).toFixed(1)}%`);
    }
    if (warm.toolCallsReductionVsBarePct !== undefined) {
      console.log(`   • Tool Calls Delta:  ${warm.toolCallsReductionVsBarePct >= 0 ? "-" : "+"}${Math.abs(warm.toolCallsReductionVsBarePct).toFixed(1)}%`);
    }
    if (warm.passRateDeltaVsBarePct !== undefined) {
      console.log(`   • Pass Rate Delta:   ${warm.passRateDeltaVsBarePct >= 0 ? "+" : ""}${warm.passRateDeltaVsBarePct.toFixed(1)} pp`);
    }
  }

  if (bare && learned) {
    console.log("\n💡 [Key A/B Findings: Autonomous Learned Skills vs Bare Pi]");
    if (learned.toolCallsReductionVsBarePct !== undefined) {
      console.log(`   • Tool Calls Delta:  ${learned.toolCallsReductionVsBarePct >= 0 ? "-" : "+"}${Math.abs(learned.toolCallsReductionVsBarePct).toFixed(1)}%`);
    }
    if (learned.passRateDeltaVsBarePct !== undefined) {
      console.log(`   • Pass Rate Delta:   ${learned.passRateDeltaVsBarePct >= 0 ? "+" : ""}${learned.passRateDeltaVsBarePct.toFixed(1)} pp`);
    }
  }
  console.log("");
}
