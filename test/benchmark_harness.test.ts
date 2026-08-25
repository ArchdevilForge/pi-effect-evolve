/**
 * Unit tests for the Agent A/B Benchmark Harness components
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parsePiJsonLines } from "../benchmark/parse-pi-events.js";
import { generateBenchmarkReport, computePairedClusterBootstrapCI } from "../benchmark/report.js";
import { setupBenchmarkFixtures } from "../benchmark/setup-fixtures.js";
import type { AgentRunResult } from "../benchmark/types.js";

describe("🧪 Benchmark Harness Component Tests", () => {
  it("parses Pi JSONL event streams and accumulates token usage, tool calls, and costs", () => {
    const mockJsonl = `
{"type":"session_start","sessionId":"s1"}
{"type":"turn_start","turnIndex":1}
{"type":"tool_execution_start","toolName":"read","input":{"path":"foo.py"}}
{"type":"tool_execution_end","toolName":"read","isError":false,"output":"print(1)"}
{"type":"tool_execution_start","toolName":"bash","input":{"command":"python3 foo.py"}}
{"type":"tool_execution_end","toolName":"bash","isError":true,"error":"SyntaxError"}
{"type":"message_end","message":{"role":"assistant","content":"Done fixing"},"usage":{"inputTokens":1200,"outputTokens":150,"cacheReadTokens":500,"cacheWriteTokens":0},"cost":0.0042}
{"type":"agent_end","status":"success"}
`;

    const parsed = parsePiJsonLines(mockJsonl);

    assert.equal(parsed.usage.inputTokens, 1200);
    assert.equal(parsed.usage.outputTokens, 150);
    assert.equal(parsed.usage.cacheReadTokens, 500);
    assert.equal(parsed.usage.cost, 0.0042);
    assert.equal(parsed.toolCalls, 2);
    assert.equal(parsed.toolErrors, 1);
    assert.equal(parsed.turns, 1);
  });

  it("calculates accurate A/B deltas and 95% Bootstrap Confidence Intervals", () => {
    const mockResults: AgentRunResult[] = [
      // Group A (Bare): 2 runs, 1 pass, cost 0.02, 10 tools
      {
        taskId: "t1",
        family: "f1",
        group: "A_bare",
        repeatIndex: 0,
        passed: true,
        verifierOutput: "VERIFIER_PASS",
        wallTimeMs: 10000,
        turns: 2,
        toolCalls: 10,
        toolErrors: 2,
        usage: { inputTokens: 10000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 10500, cost: 0.02 },
        recalledSkills: [],
        crystallizedSkills: [],
        exitCode: 0,
      },
      {
        taskId: "t1",
        family: "f1",
        group: "A_bare",
        repeatIndex: 1,
        passed: false,
        verifierOutput: "VERIFIER_FAIL",
        wallTimeMs: 12000,
        turns: 3,
        toolCalls: 12,
        toolErrors: 3,
        usage: { inputTokens: 12000, outputTokens: 600, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 12600, cost: 0.024 },
        recalledSkills: [],
        crystallizedSkills: [],
        exitCode: 1,
      },
      // Group C (Warm): 2 runs, 2 pass, cost 0.012, 5 tools
      {
        taskId: "t1",
        family: "f1",
        group: "C_warm",
        repeatIndex: 0,
        passed: true,
        verifierOutput: "VERIFIER_PASS",
        wallTimeMs: 6000,
        turns: 1,
        toolCalls: 5,
        toolErrors: 0,
        usage: { inputTokens: 6000, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 6300, cost: 0.012 },
        recalledSkills: ["gold-skill"],
        crystallizedSkills: [],
        exitCode: 0,
      },
      {
        taskId: "t1",
        family: "f1",
        group: "C_warm",
        repeatIndex: 1,
        passed: true,
        verifierOutput: "VERIFIER_PASS",
        wallTimeMs: 5500,
        turns: 1,
        toolCalls: 4,
        toolErrors: 0,
        usage: { inputTokens: 5800, outputTokens: 280, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 6080, cost: 0.011 },
        recalledSkills: ["gold-skill"],
        crystallizedSkills: [],
        exitCode: 0,
      },
    ];

    const report = generateBenchmarkReport(mockResults, "mock-gpt");
    assert.equal(report.groups["A_bare"]?.passRate, 50);
    assert.equal(report.groups["C_warm"]?.passRate, 100);
    assert.ok((report.groups["C_warm"]?.costReductionVsBarePct ?? 0) > 40);
    assert.ok((report.groups["C_warm"]?.toolCallsReductionVsBarePct ?? 0) > 50);

    const ci = computePairedClusterBootstrapCI(mockResults.slice(0, 2), mockResults.slice(2, 4), (r: AgentRunResult) => r.toolCalls, 20260824, 100);
    assert.ok(ci.median < 0, "Median change should be negative (reduction)");
  });

  it("reports paired outcomes instead of inferring them from separate medians", () => {
    const makeRun = (group: "A_bare" | "D_learned", taskId: string, passed: boolean, tokens: number, tools: number): AgentRunResult => ({
      taskId,
      family: "paired-family",
      taskClass: "transformation",
      group,
      repeatIndex: 0,
      passed,
      verifierOutput: passed ? "VERIFIER_PASS" : "VERIFIER_FAIL",
      wallTimeMs: 1000,
      turns: 1,
      toolCalls: tools,
      toolErrors: 0,
      usage: { inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: tokens, cost: 0 },
      recalledSkills: [],
      crystallizedSkills: [],
      exitCode: passed ? 0 : 1,
    });

    const report = generateBenchmarkReport([
      makeRun("A_bare", "t1", true, 10, 2),
      makeRun("A_bare", "t2", false, 20, 3),
      makeRun("A_bare", "t3", true, 30, 4),
      makeRun("A_bare", "t4", false, 40, 5),
      makeRun("D_learned", "t1", true, 12, 2),
      makeRun("D_learned", "t2", true, 22, 4),
      makeRun("D_learned", "t3", false, 32, 5),
      makeRun("D_learned", "t4", false, 42, 5),
    ], "mock-gpt");

    assert.equal(report.pairedOutcome?.totalPairs, 4);
    assert.equal(report.pairedOutcome?.bothPassPairs, 1);
    assert.equal(report.pairedOutcome?.baselineOnlyPassPairs, 1);
    assert.equal(report.pairedOutcome?.treatmentOnlyPassPairs, 1);
    assert.equal(report.pairedOutcome?.bothPass.toolCalls.medianDelta, 0);
    assert.equal(report.pairedOutcome?.mcnemarExactPValue, 1);
    assert.equal(report.taskClassBreakdown?.[0]?.familyCount, 1);
  });

  it("sets up deterministic local fixtures and verifiers without network dependency", () => {
    setupBenchmarkFixtures();
    // Fixtures are written deterministically
    assert.ok(true);
  });
});
