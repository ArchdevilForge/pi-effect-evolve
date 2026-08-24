/**
 * Statistical Reporter for Agent A/B Benchmark
 * Implements Paired Cluster Bootstrap 95% Confidence Intervals.
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

/**
 * Compute Paired Cluster Bootstrap 95% Confidence Interval for differences between treatment and baseline.
 * Pairs runs by (family, taskId, repeatIndex) to eliminate inter-task variance.
 */
export function computePairedBootstrapCI(
  baselineRuns: AgentRunResult[],
  treatmentRuns: AgentRunResult[],
  metricExtractor: (r: AgentRunResult) => number,
  iterations = 2000,
): { low95: number; median: number; high95: number } {
  // Build matched pairs map: key = `${family}-${repeatIndex}`
  const pairs: { baseVal: number; treatVal: number }[] = [];

  for (const t of treatmentRuns) {
    const matchedBase = baselineRuns.find(
      (b) => b.family === t.family && b.repeatIndex === t.repeatIndex,
    );
    if (matchedBase) {
      pairs.push({
        baseVal: metricExtractor(matchedBase),
        treatVal: metricExtractor(t),
      });
    }
  }

  if (pairs.length === 0) {
    return { low95: 0, median: 0, high95: 0 };
  }

  const nPairs = pairs.length;
  const diffPercentages: number[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    // Cluster resample pairs with replacement
    let sumBase = 0;
    let sumTreat = 0;
    for (let i = 0; i < nPairs; i++) {
      const idx = Math.floor(Math.random() * nPairs);
      sumBase += pairs[idx]!.baseVal;
      sumTreat += pairs[idx]!.treatVal;
    }

    const avgBase = sumBase / nPairs;
    const avgTreat = sumTreat / nPairs;
    const pctChange = avgBase !== 0 ? ((avgTreat - avgBase) / avgBase) * 100 : 0;
    diffPercentages.push(pctChange);
  }

  diffPercentages.sort((a, b) => a - b);
  return {
    low95: diffPercentages[Math.floor(iterations * 0.025)] ?? 0,
    median: diffPercentages[Math.floor(iterations * 0.500)] ?? 0,
    high95: diffPercentages[Math.floor(iterations * 0.975)] ?? 0,
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
  const bareRuns = groups["A_bare"] ?? [];
  const base = groupStats["A_bare"];
  const ciMap: Record<string, { metric: string; low95: number; median: number; high95: number }> = {};

  if (base && bareRuns.length > 0) {
    for (const [grp, st] of Object.entries(groupStats)) {
      if (grp === "A_bare") continue;
      const treatRuns = groups[grp] ?? [];

      if (base.medianCost > 0) {
        st.costReductionVsBarePct = ((base.medianCost - st.medianCost) / base.medianCost) * 100;
      }
      if (base.medianToolCalls > 0) {
        st.toolCallsReductionVsBarePct = ((base.medianToolCalls - st.medianToolCalls) / base.medianToolCalls) * 100;
      }
      st.passRateDeltaVsBarePct = st.passRate - base.passRate;

      // Compute Paired Bootstrap CIs for Cost and Tool Calls
      if (treatRuns.length > 0) {
        const costCI = computePairedBootstrapCI(bareRuns, treatRuns, (r) => r.usage.cost);
        const toolsCI = computePairedBootstrapCI(bareRuns, treatRuns, (r) => r.toolCalls);
        ciMap[`${grp}_cost`] = { metric: "Cost Delta %", ...costCI };
        ciMap[`${grp}_tool_calls`] = { metric: "Tool Calls Delta %", ...toolsCI };
      }
    }
  }

  return {
    timestamp: new Date().toISOString(),
    model: modelName,
    totalRuns: results.length,
    groups: groupStats,
    bootstrapConfidenceIntervals: ciMap,
  };
}

export function printFormattedReportTable(summary: BenchmarkReportSummary): void {
  console.log("\n" + "=".repeat(95));
  console.log(`📊 PAIRED AGENT A/B BENCHMARK REPORT (Model: ${summary.model})`);
  console.log(`   Timestamp: ${summary.timestamp} | Total Agent Executions: ${summary.totalRuns}`);
  console.log("=".repeat(95));

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
    headers[0]!.padEnd(22) +
    headers[1]!.padEnd(16) +
    headers[2]!.padEnd(14) +
    headers[3]!.padEnd(16) +
    headers[4]!.padEnd(16) +
    headers[5]!.padEnd(14) +
    headers[6]!
  );
  console.log("-".repeat(95));

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
      label.padEnd(22) +
      passStr.padEnd(16) +
      costStr.padEnd(14) +
      inTokStr.padEnd(16) +
      toolsStr.padEnd(16) +
      errStr.padEnd(14) +
      timeStr
    );
  }
  console.log("=".repeat(95));

  // Print Bootstrap 95% Confidence Intervals
  if (summary.bootstrapConfidenceIntervals && Object.keys(summary.bootstrapConfidenceIntervals).length > 0) {
    console.log("\n📈 [Paired Cluster Bootstrap 95% Confidence Intervals vs Bare Pi]");
    for (const [key, ci] of Object.entries(summary.bootstrapConfidenceIntervals)) {
      const groupName = key.replace(/_(cost|tool_calls)$/, "");
      const label = groupName === "C_warm" ? "Group C (Warm)" :
                    groupName === "D_learned" ? "Group D (Learned)" : groupName;
      console.log(
        `   • ${label} ${ci.metric.padEnd(20)}: ${ci.median >= 0 ? "+" : ""}${ci.median.toFixed(1)}% [95% CI: ${ci.low95.toFixed(1)}%, ${ci.high95.toFixed(1)}%]`
      );
    }
  }

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
