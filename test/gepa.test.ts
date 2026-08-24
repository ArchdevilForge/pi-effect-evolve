import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diagnose, mutate, evaluate } from "../src/gepa.js";
import type { TraceGoal } from "../src/types.js";

describe("GEPA-lite (Phase 4)", () => {
  const failedGoal: TraceGoal = {
    goalId: "test-goal-1",
    description: "sign chain extraction",
    startTs: Date.now() - 10000,
    endTs: Date.now(),
    outcome: "failure",
    events: [
      { id: "e1", goalId: "test-goal-1", tool: "web_real", input: {}, output: "ok", isError: false, durationMs: 100, ts: Date.now() - 5000 },
      { id: "e2", goalId: "test-goal-1", parentId: "e1", tool: "bash", input: { command: "node replay.js" }, output: "ETIMEDOUT after 30s", isError: true, errorCategory: "timeout", errorDetail: "ETIMEDOUT after 30s", durationMs: 30000, ts: Date.now() - 2000 },
      { id: "e3", goalId: "test-goal-1", parentId: "e2", tool: "bash", input: { command: "retry" }, output: "timeout again", isError: true, errorCategory: "timeout", errorDetail: "still timing out", durationMs: 30000, ts: Date.now() - 1000 },
    ],
  };

  it("diagnoses failure patterns from goals", () => {
    const diags = diagnose([failedGoal]);
    assert.equal(diags.length, 1);
    assert.match(diags[0]!.failurePattern, /timeout/);
    assert.ok(diags[0]!.rootCause.length > 0);
    assert.ok(diags[0]!.suggestedFix.length > 0);
  });

  it("generates variants from diagnosis", () => {
    const diags = diagnose([failedGoal]);
    const variants = mutate(diags[0]!, "print('hello')", "test-skill");
    assert.ok(variants.length >= 1);
    assert.ok(variants.length <= 3);
    // at least one should have retry logic for timeout
    assert.ok(variants.some((v) => v.code.includes("retry")));
  });

  it("evaluates variants with size gate", () => {
    const diags = diagnose([failedGoal]);
    const variants = mutate(diags[0]!, "print('hello')", "test-skill");
    const evaluated = evaluate(variants, 15);
    // all should have scores
    for (const v of evaluated) {
      assert.ok(typeof v.score === "number");
    }
    // sorted by score descending
    for (let i = 1; i < evaluated.length; i++) {
      assert.ok((evaluated[i - 1]!.score ?? 0) >= (evaluated[i]!.score ?? 0));
    }
  });

  it("blocks oversized variants", () => {
    const bigCode = "x".repeat(20 * 1024);
    const diags = diagnose([failedGoal]);
    const variants = mutate(diags[0]!, bigCode, "big-skill");
    const evaluated = evaluate(variants, 15);
    // all should score 0 (over 15KB)
    for (const v of evaluated) {
      assert.equal(v.score, 0);
    }
  });

  it("handles goals with no errors gracefully", () => {
    const okGoal: TraceGoal = {
      goalId: "ok-goal",
      description: "all good",
      startTs: Date.now(),
      events: [
        { id: "e1", goalId: "ok-goal", tool: "bash", input: {}, output: "ok", isError: false, durationMs: 10, ts: Date.now() },
      ],
    };
    const diags = diagnose([okGoal]);
    assert.equal(diags.length, 0);
  });

  it("generates validation variants for runtime errors", () => {
    const runtimeGoal: TraceGoal = {
      goalId: "rt-goal",
      description: "runtime fail",
      startTs: Date.now(),
      outcome: "failure",
      events: [
        { id: "e1", goalId: "rt-goal", tool: "bash", input: {}, output: "TypeError: x is not a function", isError: true, errorCategory: "runtime", errorDetail: "TypeError: x is not a function", durationMs: 50, ts: Date.now() },
      ],
    };
    const diags = diagnose([runtimeGoal]);
    const variants = mutate(diags[0]!, "x()", "rt-skill");
    // should have validation variant
    assert.ok(variants.some((v) => v.code.includes("validate")));
  });
});
