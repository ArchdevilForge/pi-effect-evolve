import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { TraceStore } from "../src/trace.js";

describe("TraceStore (Phase 2)", () => {
  let store: TraceStore;

  beforeEach(() => {
    store = new TraceStore();
  });

  it("starts a goal and records events", () => {
    const goalId = store.startGoal("test goal");
    assert.ok(goalId);
    const event = store.record({
      tool: "bash",
      input: { command: "echo hi" },
      output: "hi",
      isError: false,
      durationMs: 10,
    });
    assert.equal(event.goalId, goalId);
    assert.equal(event.tool, "bash");
    assert.equal(event.isError, false);
  });

  it("auto-creates goal if none active", () => {
    const event = store.record({
      tool: "read",
      input: { path: "/tmp/x" },
      output: "content",
      isError: false,
      durationMs: 5,
    });
    assert.ok(event.goalId);
    assert.ok(store.activeGoal());
  });

  it("tracks causal chain via parentId", () => {
    store.startGoal("chain test");
    const e1 = store.record({ tool: "a", input: {}, output: "", isError: false, durationMs: 1 });
    const e2 = store.record({ tool: "b", input: {}, output: "", isError: false, durationMs: 1 });
    assert.equal(e2.parentId, e1.id);
  });

  it("categorizes errors", () => {
    store.startGoal("err test");
    const e = store.record({
      tool: "web_real",
      input: {},
      output: "timeout waiting for response",
      isError: true,
      errorCategory: "timeout",
      errorDetail: "ETIMEDOUT after 30s",
      durationMs: 30000,
    });
    assert.equal(e.errorCategory, "timeout");
    assert.equal(e.errorDetail, "ETIMEDOUT after 30s");
  });

  it("ends goal with outcome", () => {
    store.startGoal("complete");
    store.record({ tool: "x", input: {}, output: "", isError: false, durationMs: 1 });
    store.endGoal("success");
    assert.equal(store.activeGoal()?.outcome, "success");
  });

  it("gets failed goals", () => {
    store.startGoal("fail1");
    store.record({ tool: "a", input: {}, output: "err", isError: true, durationMs: 1 });
    store.endGoal("failure");
    store.startGoal("ok1");
    store.record({ tool: "b", input: {}, output: "ok", isError: false, durationMs: 1 });
    store.endGoal("success");
    assert.equal(store.getFailedGoals().length, 1);
  });

  it("getEvents respects limit", () => {
    store.startGoal("limit");
    for (let i = 0; i < 20; i++) {
      store.record({ tool: `t${i}`, input: {}, output: "", isError: false, durationMs: 1 });
    }
    assert.equal(store.getEvents(5).length, 5);
    assert.equal(store.getEvents(100).length, 20);
  });

  it("evicts oldest goals beyond MAX_GOALS", () => {
    for (let i = 0; i < 25; i++) {
      store.startGoal(`goal-${i}`);
    }
    assert.ok(store.getGoals().length <= 21); // MAX_GOALS=20 + current
  });

  it("produces summary", () => {
    store.startGoal("summarize me");
    store.record({ tool: "bash", input: {}, output: "ok", isError: false, durationMs: 42 });
    const s = store.summary();
    assert.match(s, /Goal: summarize me/);
    assert.match(s, /bash OK 42ms/);
  });

  it("caps output at 4000 chars", () => {
    store.startGoal("big output");
    const big = "x".repeat(10000);
    const e = store.record({ tool: "t", input: {}, output: big, isError: false, durationMs: 1 });
    assert.equal(e.output.length, 4000);
  });
});
