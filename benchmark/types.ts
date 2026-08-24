/**
 * Types and definitions for the Agent A/B Benchmark Harness
 */

export interface BenchmarkTask {
  id: string;
  family: string;
  type: "train" | "held_out_a" | "held_out_b";
  prompt: string;
  fixtureDir: string;
  setupCommands?: string[] | undefined;
  verifierScript: string;
  goldSkillSlug?: string | undefined;
}

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
  medianToolCalls: number;
  meanToolErrors: number;
  medianWallTimeMs: number;
  costReductionVsBarePct?: number | undefined;
  toolCallsReductionVsBarePct?: number | undefined;
  passRateDeltaVsBarePct?: number | undefined;
}

export interface BenchmarkReportSummary {
  timestamp: string;
  model: string;
  totalRuns: number;
  groups: Record<string, GroupStats>;
  bootstrapConfidenceIntervals?: Record<string, {
    metric: string;
    low95: number;
    median: number;
    high95: number;
  }>;
}
