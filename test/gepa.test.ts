import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as Fs from "node:fs";
import * as Path from "node:path";
import * as Os from "node:os";
import { diagnose, mutate, evaluate, autoHealFailure } from "../src/gepa.js";
import { SkillMemory } from "../src/memory.js";
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
    assert.ok(variants.some((v) => v.code.includes("retry")));
  });

  it("evaluates variants with size gate", () => {
    const diags = diagnose([failedGoal]);
    const variants = mutate(diags[0]!, "print('hello')", "test-skill");
    const evaluated = evaluate(variants, 15);
    for (const v of evaluated) {
      assert.ok(typeof v.score === "number");
    }
    for (let i = 1; i < evaluated.length; i++) {
      assert.ok((evaluated[i - 1]!.score ?? 0) >= (evaluated[i]!.score ?? 0));
    }
  });

  it("blocks oversized variants", () => {
    const bigCode = "x".repeat(20 * 1024);
    const diags = diagnose([failedGoal]);
    const variants = mutate(diags[0]!, bigCode, "big-skill");
    const evaluated = evaluate(variants, 15);
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
    assert.ok(variants.some((v) => v.code.includes("validate")));
  });

  it("autoHealFailure automatically mutates and updates a failing skill", () => {
    const tmpDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "pi-gepa-heal-"));
    try {
      const mem = new SkillMemory(tmpDir);
      const skillDir = Path.join(tmpDir, "api-fetch");
      Fs.mkdirSync(skillDir, { recursive: true });
      Fs.writeFileSync(Path.join(skillDir, "SKILL.md"), "# API Fetch", "utf8");
      Fs.writeFileSync(Path.join(skillDir, "script.py"), "import requests\nresp = requests.get('https://api.example.com')", "utf8");
      Fs.writeFileSync(Path.join(skillDir, "meta.json"), "{}", "utf8");

      mem.register({
        slug: "api-fetch",
        title: "API Fetcher",
        tags: ["api", "requests", "ETIMEDOUT"],
        createdAt: new Date().toISOString(),
        sizeBytes: 100,
      });

      const healGoal: TraceGoal = {
        goalId: "heal-g1",
        description: "fetch api data",
        startTs: Date.now() - 10000,
        outcome: "failure",
        events: [
          { id: "e1", goalId: "heal-g1", tool: "bash", input: { command: "python script.py" }, output: "ETIMEDOUT", isError: true, errorCategory: "timeout", errorDetail: "ETIMEDOUT", durationMs: 30000, ts: Date.now() },
        ],
      };

      const healed = autoHealFailure(healGoal, mem, tmpDir, 15);
      assert.ok(healed);
      assert.equal(healed!.slug, "api-fetch");
      assert.ok(healed!.score >= 30);

      const updated = mem.readSkill("api-fetch");
      assert.ok(updated);
      assert.ok(updated!.code.includes("retry") || updated!.code.includes("with_retry"));
    } finally {
      Fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
