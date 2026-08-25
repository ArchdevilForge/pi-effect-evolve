/**
 * Types and definitions for the Agent A/B Benchmark Harness
 */

export interface BenchmarkTask {
  id: string;
  family: string;
  taskClass: BenchmarkTaskClass;
  type: "train" | "held_out_a" | "held_out_b";
  prompt: string;
  fixtureDir: string;
  setupCommands?: string[] | undefined;
  verifierScript: string;
  goldSkillSlug?: string | undefined;
}

export type BenchmarkTaskClass =
  | "transformation"
  | "diagnostic"
  | "repository_modification"
  | "one_off_reasoning";

export interface PiExecutionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
}

export interface AgentRunResult {
  taskId: string;
  family: string;
  taskClass?: BenchmarkTaskClass | string | undefined;
  group: "A_bare" | "B_empty" | "C_warm" | "D_learned" | "E_poison";
  repeatIndex: number;
  passed: boolean;
  verifierOutput: string;
  wallTimeMs: number;
  turns: number;
  toolCalls: number;
  toolErrors: number;
  usage: PiExecutionUsage;
  recalledSkills: string[];
  crystallizedSkills: string[];
  exitCode: number;
  error?: string | undefined;
  // Stage 1 Training Metadata for Group D
  trainPassed?: boolean | undefined;
  trainCost?: number | undefined;
  trainInputTokens?: number | undefined;
  trainTotalTokens?: number | undefined;
  trainToolCalls?: number | undefined;
  trainCrystallizedCount?: number | undefined;
  trainWallTimeMs?: number | undefined;
  trainTaskId?: string | undefined;
  trainRunKey?: string | undefined;
  heldoutRecalledLearnedSkill?: boolean | undefined;
}

export interface GroupStats {
  group: string;
  runs: number;
  passCount: number;
  passRate: number;
  medianCost: number;
  meanCost: number;
  medianInputTokens: number;
  medianOutputTokens: number;
  medianCacheReadTokens: number;
  medianTotalTokens: number;
  medianToolCalls: number;
  meanToolErrors: number;
  medianWallTimeMs: number;
  costReductionVsBarePct?: number | undefined;
  totalTokensReductionVsBarePct?: number | undefined;
  toolCallsReductionVsBarePct?: number | undefined;
  wallTimeReductionVsBarePct?: number | undefined;
  passRateDeltaVsBarePct?: number | undefined;
}

export interface LearningCoverageReport {
  trainTotal: number;
  trainPassCount: number;
  trainPassRatePct: number;
  crystallizeCount: number;
  crystallizeRatePct: number;
  heldoutTotal: number;
  heldoutRecallCount: number;
  heldoutRecallRatePct: number;
  usefulRecallCount: number;
  usefulRecallRatePct: number;
  medianTrainCost: number;
  medianTrainTotalTokens: number;
  medianTrainToolCalls: number;
  medianTrainWallTimeMs: number;
  medianHeldoutSavingsTokens: number;
  heldoutSavingsPct: number;
  breakEvenReuseCount: number | null;
}

export interface FamilyBreakdownRow {
  family: string;
  taskClass: string;
  barePassRatePct: number;
  learnedPassRatePct: number;
  bareMedianTools: number;
  learnedMedianTools: number;
  toolsDeltaPct: number;
  bareMedianTotalTokens: number;
  learnedMedianTotalTokens: number;
  totalTokensDeltaPct: number;
  bareMedianTimeSec: number;
  learnedMedianTimeSec: number;
  timeDeltaPct: number;
  learnedRecallRatePct: number;
  usefulRecallRatePct: number;
  pairedSuccessCount: number;
  pairedMedianToolDelta: number | null;
  pairedMedianTokenDelta: number | null;
}

export interface TaskClassBreakdownRow {
  taskClass: string;
  familyCount: number;
  barePassRatePct: number;
  learnedPassRatePct: number;
  bareMedianTools: number;
  learnedMedianTools: number;
  bareMedianTotalTokens: number;
  learnedMedianTotalTokens: number;
  pairedSuccessCount: number;
  pairedMedianToolDelta: number | null;
  pairedMedianTokenDelta: number | null;
}

export interface PairedMetricSummary {
  baselineMedian: number | null;
  treatmentMedian: number | null;
  medianDelta: number | null;
  medianDeltaPct: number | null;
  treatmentLowerCount: number;
  equalCount: number;
  treatmentHigherCount: number;
}

export interface PairedOutcomeReport {
  totalPairs: number;
  bothPassPairs: number;
  baselineOnlyPassPairs: number;
  treatmentOnlyPassPairs: number;
  bothFailPairs: number;
  mcnemarExactPValue: number;
  bothPass: {
    totalTokens: PairedMetricSummary;
    toolCalls: PairedMetricSummary;
    wallTimeMs: PairedMetricSummary;
  };
}

export interface BenchmarkReportSummary {
  timestamp: string;
  model: string;
  thinkingLevel: string;
  totalRuns: number;
  groups: Record<string, GroupStats>;
  learningCoverage?: LearningCoverageReport | undefined;
  familyBreakdown?: FamilyBreakdownRow[] | undefined;
  taskClassBreakdown?: TaskClassBreakdownRow[] | undefined;
  pairedOutcome?: PairedOutcomeReport | undefined;
  bootstrapConfidenceIntervals?: Record<string, {
    metric: string;
    low95: number;
    median: number;
    high95: number;
  }> | undefined;
  metadata?: Record<string, string | number> | undefined;
}
