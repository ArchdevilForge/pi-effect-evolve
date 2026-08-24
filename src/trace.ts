/**
 * pi-effect-evolve — structured trace system (Phase 2)
 * Replaces untyped any[] ring buffer with goal-aware, causal, persistent traces
 */
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import type { TraceEvent, TraceGoal, ErrorCategory } from "./types.js";

const MAX_EVENTS_PER_GOAL = 200;
const MAX_GOALS = 20;

export class TraceStore {
  private goals: Map<string, TraceGoal> = new Map();
  private activeGoalId: string | undefined;
  private lastEventId: string | undefined;

  /** Start a new goal (user intent / task) */
  startGoal(description: string): string {
    const goalId = NodeCrypto.randomUUID();
    this.goals.set(goalId, {
      goalId,
      description,
      events: [],
      startTs: Date.now(),
    });
    this.activeGoalId = goalId;
    this.lastEventId = undefined;
    // evict oldest goals beyond limit
    if (this.goals.size > MAX_GOALS) {
      const oldest = this.goals.keys().next().value;
      if (oldest !== undefined) this.goals.delete(oldest);
    }
    return goalId;
  }

  /** End the active goal with an outcome */
  endGoal(outcome: "success" | "failure" | "partial"): void {
    const goal = this.activeGoal();
    if (goal) {
      goal.endTs = Date.now();
      goal.outcome = outcome;
    }
  }

  /** Record a trace event */
  record(raw: {
    tool: string;
    input: Record<string, unknown>;
    output: string;
    isError: boolean;
    errorCategory?: ErrorCategory | undefined;
    errorDetail?: string | undefined;
    durationMs: number;
  }): TraceEvent {
    // auto-create goal if none active
    if (!this.activeGoalId || !this.goals.has(this.activeGoalId)) {
      this.startGoal("auto");
    }
    const goal = this.goals.get(this.activeGoalId!)!;
    const event: TraceEvent = {
      id: NodeCrypto.randomUUID(),
      goalId: this.activeGoalId!,
      parentId: this.lastEventId,
      tool: raw.tool,
      input: raw.input,
      output: raw.output.slice(0, 4000), // cap output size
      isError: raw.isError,
      errorCategory: raw.errorCategory,
      errorDetail: raw.errorDetail,
      durationMs: raw.durationMs,
      ts: Date.now(),
    };
    goal.events.push(event);
    if (goal.events.length > MAX_EVENTS_PER_GOAL) goal.events.shift();
    this.lastEventId = event.id;
    return event;
  }

  /** Get active goal */
  activeGoal(): TraceGoal | undefined {
    return this.activeGoalId ? this.goals.get(this.activeGoalId) : undefined;
  }

  /** Get last N events across all goals or for a specific goal */
  getEvents(limit: number, goalId?: string): TraceEvent[] {
    if (goalId) {
      return this.goals.get(goalId)?.events.slice(-limit) ?? [];
    }
    const all: TraceEvent[] = [];
    for (const g of this.goals.values()) all.push(...g.events);
    all.sort((a, b) => a.ts - b.ts);
    return all.slice(-limit);
  }

  /** Get all goals (for GEPA diagnosis) */
  getGoals(): TraceGoal[] {
    return [...this.goals.values()];
  }

  /** Get failed goals (for GEPA) */
  getFailedGoals(): TraceGoal[] {
    return [...this.goals.values()].filter(
      (g) => g.outcome === "failure" || g.events.some((e) => e.isError),
    );
  }

  /** Persist traces to disk */
  persist(dir: string): void {
    const p = NodePath.join(dir, ".pi", "traces.json");
    try {
      NodeFs.mkdirSync(NodePath.dirname(p), { recursive: true });
      const data = {
        activeGoalId: this.activeGoalId,
        goals: Object.fromEntries(this.goals),
      };
      NodeFs.writeFileSync(p, JSON.stringify(data), "utf8");
    } catch {}
  }

  /** Restore traces from disk */
  restore(dir: string): void {
    const p = NodePath.join(dir, ".pi", "traces.json");
    try {
      const raw = JSON.parse(NodeFs.readFileSync(p, "utf8"));
      this.activeGoalId = raw.activeGoalId;
      this.goals = new Map(Object.entries(raw.goals ?? {}));
    } catch {}
  }

  /** Compact summary for context injection */
  summary(limit = 5): string {
    const goal = this.activeGoal();
    if (!goal) return "(no active trace)";
    const recent = goal.events.slice(-limit);
    const lines = recent.map(
      (e) =>
        `${e.tool}${e.isError ? " ERR" : " OK"} ${e.durationMs}ms${e.errorDetail ? " — " + e.errorDetail : ""}`,
    );
    return `Goal: ${goal.description}\n${lines.join("\n")}`;
  }
}
