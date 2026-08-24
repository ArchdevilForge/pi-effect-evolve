/**
 * Statistical Reporter for Agent A/B Benchmark
 * Implements Family Breakdown, Learning Funnel (Useful Recall), and Total Token / Cache Accounting.
 */
import type {
  AgentRunResult,
  GroupStats,
  BenchmarkReportSummary,
  LearningCoverageReport,
  FamilyBreakdownRow,
} from "./types.js";

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

/** PRNG for reproducible bootstrap sampling */
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Compute Paired Cluster Bootstrap 95% Confidence Interval.
 * Resamples entire family clusters to prevent intra-family correlation inflation.
 */
export function computePairedClusterBootstrapCI(
  baselineRuns: AgentRunResult[],
  treatmentRuns: AgentRunResult[],
  metricExtractor: (r: AgentRunResult) => number,
  seed = 20260824,
  iterations = 2000,
): { low95: number; median: number; high95: number } {
  const families = Array.from(new Set(baselineRuns.map((r) => r.family)));
  if (families.length === 0) return { low95: 0, median: 0, high95: 0 };

  const rand = seededRandom(seed);
  const diffPercentages: number[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    let sumBase = 0;
    let sumTreat = 0;
    let count = 0;

    for (let f = 0; f < families.length; f++) {
      const sampledFamily = families[Math.floor(rand() * families.length)]!;
      const baseFamilyRuns = baselineRuns.filter((r) => r.family === sampledFamily);
      const treatFamilyRuns = treatmentRuns.filter((r) => r.family === sampledFamily);

      for (const t of treatFamilyRuns) {
        const matchedBase = baseFamilyRuns.find(
          (b) => b.repeatIndex === t.repeatIndex && b.taskId === t.taskId,
        );
        if (matchedBase) {
          sumBase += metricExtractor(matchedBase);
          sumTreat += metricExtractor(t);
          count++;
        }
      }
    }

    if (count > 0 && sumBase > 0) {
      const avgBase = sumBase / count;
      const avgTreat = sumTreat / count;
      const pctChange = ((avgTreat - avgBase) / avgBase) * 100;
      diffPercentages.push(pctChange);
    }
  }

  if (diffPercentages.length === 0) return { low95: 0, median: 0, high95: 0 };

  diffPercentages.sort((a, b) => a - b);
  return {
    low95: diffPercentages[Math.floor(diffPercentages.length * 0.025)] ?? 0,
    median: diffPercentages[Math.floor(diffPercentages.length * 0.500)] ?? 0,
    high95: diffPercentages[Math.floor(diffPercentages.length * 0.975)] ?? 0,
  };
}

export function generateBenchmarkReport(
  results: AgentRunResult[],
  modelName = "active-model",
  thinkingLevel = "high",
  seed = 20260824,
): BenchmarkReportSummary {
  const groups: Record<string, AgentRunResult[]> = {};
  for (const r of results) {
    if (!groups[r.group]) groups[r.group] = [];
    groups[r.group]!.push(r);
  }

  const groupStats: Record<string, GroupStats> = {};

  for (const [grp, runs] of Object.entries(groups)) {
    const passCount = runs.filter((r) => r.passed).length;
    const costs = runs.map((r) => (Number.isFinite(r.usage.cost) ? r.usage.cost : 0));
    const inTokens = runs.map((r) => r.usage.inputTokens);
    const outTokens = runs.map((r) => r.usage.outputTokens);
    const cacheTokens = runs.map((r) => r.usage.cacheReadTokens);
    const totalTokens = runs.map((r) => r.usage.totalTokens);
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
      medianCacheReadTokens: median(cacheTokens),
      medianTotalTokens: median(totalTokens),
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
      if (base.medianTotalTokens > 0) {
        st.totalTokensReductionVsBarePct = ((base.medianTotalTokens - st.medianTotalTokens) / base.medianTotalTokens) * 100;
      }
      if (base.medianToolCalls > 0) {
        st.toolCallsReductionVsBarePct = ((base.medianToolCalls - st.medianToolCalls) / base.medianToolCalls) * 100;
      }
      if (base.medianWallTimeMs > 0) {
        st.wallTimeReductionVsBarePct = ((base.medianWallTimeMs - st.medianWallTimeMs) / base.medianWallTimeMs) * 100;
      }
      st.passRateDeltaVsBarePct = st.passRate - base.passRate;

      // Compute Paired Cluster Bootstrap CIs
      if (treatRuns.length > 0) {
        const totalTokCI = computePairedClusterBootstrapCI(bareRuns, treatRuns, (r) => r.usage.totalTokens, seed);
        const toolsCI = computePairedClusterBootstrapCI(bareRuns, treatRuns, (r) => r.toolCalls, seed);
        ciMap[`${grp}_total_tokens`] = { metric: "Total Tokens Delta %", ...totalTokCI };
        ciMap[`${grp}_tool_calls`] = { metric: "Tool Calls Delta %", ...toolsCI };
      }
    }
  }

  // Compute Learning Coverage & Useful Recall Funnel for Group D
  let learningCoverage: LearningCoverageReport | undefined = undefined;
  const dRuns = groups["D_learned"] ?? [];
  if (dRuns.length > 0) {
    const withTrain = dRuns.filter((r) => r.trainPassed !== undefined);
    const trainPassCount = withTrain.filter((r) => r.trainPassed === true).length;
    const crystallizeCount = withTrain.filter((r) => (r.trainCrystallizedCount ?? 0) > 0).length;
    const recallCount = withTrain.filter((r) => r.heldoutRecalledLearnedSkill === true || r.recalledSkills.length > 0).length;
    const usefulRecallCount = withTrain.filter(
      (r) => (r.heldoutRecalledLearnedSkill === true || r.recalledSkills.length > 0) && r.passed === true,
    ).length;
    const trainCosts = withTrain.map((r) => r.trainCost ?? 0);
    const medTrainCost = median(trainCosts);

    const baseMedCost = base?.medianCost ?? 0;
    const dMedCost = groupStats["D_learned"]?.medianCost ?? 0;
    const savingsPerRun = baseMedCost - dMedCost;
    const breakEvenReuses = savingsPerRun > 0 && medTrainCost > 0 ? medTrainCost / savingsPerRun : undefined;

    learningCoverage = {
      trainTotal: withTrain.length,
      trainPassCount,
      trainPassRatePct: withTrain.length > 0 ? (trainPassCount / withTrain.length) * 100 : 0,
      crystallizeCount,
      crystallizeRatePct: withTrain.length > 0 ? (crystallizeCount / withTrain.length) * 100 : 0,
      heldoutRecallCount: recallCount,
      heldoutRecallRatePct: withTrain.length > 0 ? (recallCount / withTrain.length) * 100 : 0,
      usefulRecallCount,
      usefulRecallRatePct: withTrain.length > 0 ? (usefulRecallCount / withTrain.length) * 100 : 0,
      medianTrainCost: medTrainCost,
      breakEvenReuses,
    };
  }

  // Compute Family Breakdown Rows
  const families = Array.from(new Set(results.map((r) => r.family)));
  const familyBreakdown: FamilyBreakdownRow[] = [];

  for (const f of families) {
    const fBare = bareRuns.filter((r) => r.family === f);
    const fLearned = dRuns.filter((r) => r.family === f);

    const barePass = fBare.length > 0 ? (fBare.filter((r) => r.passed).length / fBare.length) * 100 : 0;
    const learnedPass = fLearned.length > 0 ? (fLearned.filter((r) => r.passed).length / fLearned.length) * 100 : 0;

    const bareTools = median(fBare.map((r) => r.toolCalls));
    const learnedTools = median(fLearned.map((r) => r.toolCalls));
    const toolsDelta = bareTools > 0 ? ((learnedTools - bareTools) / bareTools) * 100 : 0;

    const bareTokens = median(fBare.map((r) => r.usage.totalTokens));
    const learnedTokens = median(fLearned.map((r) => r.usage.totalTokens));
    const tokensDelta = bareTokens > 0 ? ((learnedTokens - bareTokens) / bareTokens) * 100 : 0;

    const bareTime = median(fBare.map((r) => r.wallTimeMs)) / 1000;
    const learnedTime = median(fLearned.map((r) => r.wallTimeMs)) / 1000;
    const timeDelta = bareTime > 0 ? ((learnedTime - bareTime) / bareTime) * 100 : 0;

    const recallCount = fLearned.filter((r) => r.heldoutRecalledLearnedSkill || r.recalledSkills.length > 0).length;
    const usefulCount = fLearned.filter((r) => (r.heldoutRecalledLearnedSkill || r.recalledSkills.length > 0) && r.passed).length;

    familyBreakdown.push({
      family: f,
      barePassRatePct: barePass,
      learnedPassRatePct: learnedPass,
      bareMedianTools: bareTools,
      learnedMedianTools: learnedTools,
      toolsDeltaPct: toolsDelta,
      bareMedianTotalTokens: bareTokens,
      learnedMedianTotalTokens: learnedTokens,
      totalTokensDeltaPct: tokensDelta,
      bareMedianTimeSec: bareTime,
      learnedMedianTimeSec: learnedTime,
      timeDeltaPct: timeDelta,
      learnedRecallRatePct: fLearned.length > 0 ? (recallCount / fLearned.length) * 100 : 0,
      usefulRecallRatePct: fLearned.length > 0 ? (usefulCount / fLearned.length) * 100 : 0,
    });
  }

  return {
    timestamp: new Date().toISOString(),
    model: modelName,
    thinkingLevel,
    totalRuns: results.length,
    groups: groupStats,
    learningCoverage,
    familyBreakdown,
    bootstrapConfidenceIntervals: ciMap,
    metadata: {
      seed,
      families: families.length,
      tasks: Array.from(new Set(results.map((r) => r.taskId))).length,
    },
  };
}

export function printFormattedReportTable(summary: BenchmarkReportSummary): void {
  console.log("\n" + "=".repeat(105));
  console.log(`📊 AGENT A/B PILOT BENCHMARK REPORT (Model: ${summary.model} | Thinking: ${summary.thinkingLevel})`);
  console.log(`   Timestamp: ${summary.timestamp} | Total Agent Runs: ${summary.totalRuns}`);
  console.log("=".repeat(105));

  const headers = [
    "Experiment Group",
    "Verifier Pass",
    "Med In Tokens",
    "Med CacheRead",
    "Med Total Toks",
    "Med Tool Calls",
    "Med Time (s)",
  ];

  console.log(
    headers[0]!.padEnd(22) +
    headers[1]!.padEnd(16) +
    headers[2]!.padEnd(16) +
    headers[3]!.padEnd(16) +
    headers[4]!.padEnd(16) +
    headers[5]!.padEnd(16) +
    headers[6]!
  );
  console.log("-".repeat(105));

  for (const [name, st] of Object.entries(summary.groups)) {
    const label = name === "A_bare" ? "A: Bare Pi" :
                  name === "B_empty" ? "B: Evolve Empty" :
                  name === "C_warm" ? "C: Evolve Warm" :
                  name === "D_learned" ? "D: Evolve Learned" : name;

    const passStr = `${st.passRate.toFixed(1)}% (${st.passCount}/${st.runs})`;
    const inTokStr = `${Math.round(st.medianInputTokens).toLocaleString()}`;
    const cacheStr = `${Math.round(st.medianCacheReadTokens).toLocaleString()}`;
    const totTokStr = `${Math.round(st.medianTotalTokens).toLocaleString()}`;
    const toolsStr = `${st.medianToolCalls.toFixed(1)}`;
    const timeStr = `${(st.medianWallTimeMs / 1000).toFixed(1)}s`;

    console.log(
      label.padEnd(22) +
      passStr.padEnd(16) +
      inTokStr.padEnd(16) +
      cacheStr.padEnd(16) +
      totTokStr.padEnd(16) +
      toolsStr.padEnd(16) +
      timeStr
    );
  }
  console.log("=".repeat(105));

  // Print Family-by-Family Breakdown
  if (summary.familyBreakdown && summary.familyBreakdown.length > 0) {
    console.log("\n📋 [Task Family Breakdown: Bare Pi vs Evolve Learned]");
    console.log(
      "Family".padEnd(18) +
      "Bare Pass".padEnd(12) +
      "D Pass".padEnd(10) +
      "Bare Tools".padEnd(13) +
      "D Tools".padEnd(10) +
      "Δ Tools".padEnd(12) +
      "Δ Total Toks".padEnd(15) +
      "Useful Recall"
    );
    console.log("-".repeat(105));

    for (const f of summary.familyBreakdown) {
      const toolsDeltaStr = `${f.toolsDeltaPct >= 0 ? "+" : ""}${f.toolsDeltaPct.toFixed(1)}%`;
      const tokDeltaStr = `${f.totalTokensDeltaPct >= 0 ? "+" : ""}${f.totalTokensDeltaPct.toFixed(1)}%`;
      const usefulStr = `${f.usefulRecallRatePct.toFixed(0)}%`;

      console.log(
        f.family.padEnd(18) +
        `${f.barePassRatePct.toFixed(0)}%`.padEnd(12) +
        `${f.learnedPassRatePct.toFixed(0)}%`.padEnd(10) +
        `${f.bareMedianTools.toFixed(1)}`.padEnd(13) +
        `${f.learnedMedianTools.toFixed(1)}`.padEnd(10) +
        toolsDeltaStr.padEnd(12) +
        tokDeltaStr.padEnd(15) +
        usefulStr
      );
    }
  }

  // Print Group D Learning Funnel & Amortization
  if (summary.learningCoverage && summary.learningCoverage.trainTotal > 0) {
    const cov = summary.learningCoverage;
    console.log("\n🧬 [Group D: Autonomous Learning Funnel & Coverage]");
    console.log(`   • Step 1 Train Solved:         ${cov.trainPassRatePct.toFixed(1)}% (${cov.trainPassCount}/${cov.trainTotal})`);
    console.log(`   • Step 2 Skill Crystallized:   ${cov.crystallizeRatePct.toFixed(1)}% (${cov.crystallizeCount}/${cov.trainTotal})`);
    console.log(`   • Step 3 Held-out Recalled:    ${cov.heldoutRecallRatePct.toFixed(1)}% (${cov.heldoutRecallCount}/${cov.trainTotal})`);
    console.log(`   • Step 4 Useful Recall (Pass): ${cov.usefulRecallRatePct.toFixed(1)}% (${cov.usefulRecallCount}/${cov.trainTotal})`);
  }

  // Print Bootstrap 95% Confidence Intervals
  const nFamilies = Number(summary.metadata?.families ?? 0);
  if (nFamilies < 5) {
    console.log(`\n📈 [Paired Cluster Bootstrap 95% CI: N/A (requires >=5 task families for valid cluster resampling, current: ${nFamilies})]`);
  } else if (summary.bootstrapConfidenceIntervals && Object.keys(summary.bootstrapConfidenceIntervals).length > 0) {
    console.log("\n📈 [Paired Cluster Bootstrap 95% Confidence Intervals vs Bare Pi]");
    for (const [key, ci] of Object.entries(summary.bootstrapConfidenceIntervals)) {
      const groupName = key.replace(/_(total_tokens|tool_calls)$/, "");
      const label = groupName === "C_warm" ? "Group C (Warm)" :
                    groupName === "D_learned" ? "Group D (Learned)" : groupName;
      console.log(
        `   • ${label} ${ci.metric.padEnd(22)}: ${ci.median >= 0 ? "+" : ""}${ci.median.toFixed(1)}% [95% CI: ${ci.low95.toFixed(1)}%, ${ci.high95.toFixed(1)}%]`
      );
    }
  }

  // Print Summary Insights
  const bare = summary.groups["A_bare"];
  const warm = summary.groups["C_warm"];
  const learned = summary.groups["D_learned"];

  if (bare && warm) {
    console.log("\n💡 [Key Findings: Warm Gold Memory vs Bare Pi]");
    if (warm.totalTokensReductionVsBarePct !== undefined) {
      console.log(`   • Total Tokens Delta:  ${warm.totalTokensReductionVsBarePct >= 0 ? "-" : "+"}${Math.abs(warm.totalTokensReductionVsBarePct).toFixed(1)}%`);
    }
    if (warm.toolCallsReductionVsBarePct !== undefined) {
      console.log(`   • Tool Calls Delta:    ${warm.toolCallsReductionVsBarePct >= 0 ? "-" : "+"}${Math.abs(warm.toolCallsReductionVsBarePct).toFixed(1)}%`);
    }
    if (warm.passRateDeltaVsBarePct !== undefined) {
      console.log(`   • Pass Rate Delta:     ${warm.passRateDeltaVsBarePct >= 0 ? "+" : ""}${warm.passRateDeltaVsBarePct.toFixed(1)} pp`);
    }
  }

  if (bare && learned) {
    console.log("\n💡 [Key Findings: Autonomous Learned Experience vs Bare Pi]");
    if (learned.totalTokensReductionVsBarePct !== undefined) {
      console.log(`   • Total Tokens Delta:  ${learned.totalTokensReductionVsBarePct >= 0 ? "-" : "+"}${Math.abs(learned.totalTokensReductionVsBarePct).toFixed(1)}%`);
    }
    if (learned.toolCallsReductionVsBarePct !== undefined) {
      console.log(`   • Tool Calls Delta:    ${learned.toolCallsReductionVsBarePct >= 0 ? "-" : "+"}${Math.abs(learned.toolCallsReductionVsBarePct).toFixed(1)}%`);
    }
    if (learned.wallTimeReductionVsBarePct !== undefined) {
      console.log(`   • Wall Time Delta:     ${learned.wallTimeReductionVsBarePct >= 0 ? "-" : "+"}${Math.abs(learned.wallTimeReductionVsBarePct).toFixed(1)}%`);
    }
    if (learned.passRateDeltaVsBarePct !== undefined) {
      console.log(`   • Pass Rate Delta:     ${learned.passRateDeltaVsBarePct >= 0 ? "+" : ""}${learned.passRateDeltaVsBarePct.toFixed(1)} pp`);
    }
  }
  console.log("");
}
