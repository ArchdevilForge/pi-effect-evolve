/**
 * pi-effect-evolve — shared types
 * Phase 2: structured trace + Phase 1: skill index types
 */

// --- typed errors (Effect) ---
export class GateError {
  readonly _tag = "GateError";
  constructor(readonly reason: string) {}
}
export class FsError {
  readonly _tag = "FsError";
  constructor(readonly cause: unknown) {}
}
export class GepaError {
  readonly _tag = "GepaError";
  constructor(readonly reason: string, readonly phase: "diagnosis" | "mutation" | "evaluation" | "selection") {}
}

// --- Phase 2: structured trace ---
export type ErrorCategory = "gate" | "timeout" | "runtime" | "validation" | "network";

export interface TraceEvent {
  id: string;
  goalId: string;
  parentId?: string | undefined;
  tool: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  errorCategory?: ErrorCategory | undefined;
  errorDetail?: string | undefined;
  durationMs: number;
  ts: number;
}

export interface TraceGoal {
  goalId: string;
  description: string;
  events: TraceEvent[];
  startTs: number;
  endTs?: number | undefined;
  outcome?: "success" | "failure" | "partial" | undefined;
}

// --- Phase 1+3: skill index ---
export type SkillType = "code" | "procedure";

export interface SkillIndexEntry {
  slug: string;
  title: string;
  type?: SkillType | undefined;
  tags: string[];
  createdAt: string;
  lastUsed: string;
  useCount: number;
  successCount: number;
  failureCount: number;
  sizeBytes: number;
  deprecated: boolean;
  deprecatedAt?: string | undefined;
}

export interface SkillIndex {
  version: 1;
  entries: SkillIndexEntry[];
  lastPruned: string;
}

// --- Phase 4: GEPA types ---
export interface GepaDiagnosis {
  goalId: string;
  failurePattern: string;
  rootCause: string;
  suggestedFix: string;
}

export interface GepaVariant {
  id: string;
  slug: string;
  code: string;
  rationale: string;
  score?: number | undefined;
}

export interface GepaResult {
  diagnosis: GepaDiagnosis;
  variants: GepaVariant[];
  selected?: GepaVariant | undefined;
  gatesPassed: boolean;
}
