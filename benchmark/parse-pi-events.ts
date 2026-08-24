/**
 * Parser for Pi JSONL streams (--mode json)
 */
import type { PiExecutionUsage } from "./types.js";

export interface ParsedPiRun {
  usage: PiExecutionUsage;
  toolCalls: number;
  toolErrors: number;
  turns: number;
  recalledSkills: string[];
  crystallizedSkills: string[];
  assistantMessages: string[];
}

export function parsePiJsonLines(jsonlOutput: string): ParsedPiRun {
  const lines = jsonlOutput.split("\n").map((l) => l.trim()).filter(Boolean);

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let totalTokens = 0;
  let cost = 0;

  let toolCalls = 0;
  let toolErrors = 0;
  let turns = 0;
  const recalledSkills = new Set<string>();
  const crystallizedSkills = new Set<string>();
  const assistantMessages: string[] = [];

  for (const line of lines) {
    try {
      const ev = JSON.parse(line);

      // 1. Token & Usage Accumulation
      if (ev.type === "message_end" || ev.type === "turn_end" || ev.type === "step_end") {
        turns++;
        const u = ev.usage ?? ev.message?.usage;
        if (u) {
          inputTokens += Number(u.inputTokens ?? u.input_tokens ?? u.input ?? 0);
          outputTokens += Number(u.outputTokens ?? u.output_tokens ?? u.output ?? 0);
          cacheReadTokens += Number(u.cacheReadTokens ?? u.cache_read_tokens ?? u.cacheRead ?? 0);
          cacheWriteTokens += Number(u.cacheWriteTokens ?? u.cache_write_tokens ?? u.cacheWrite ?? 0);
          totalTokens += Number(u.totalTokens ?? u.total_tokens ?? 0);
          cost += Number(ev.cost ?? u.cost ?? 0);
        }
      }

      // Assistant Text Output
      if (ev.type === "message_end" && ev.message?.role === "assistant" && typeof ev.message?.content === "string") {
        assistantMessages.push(ev.message.content);
      }

      // 2. Tool Calls & Tool Errors
      if (ev.type === "tool_execution_end" || ev.type === "tool_result") {
        toolCalls++;
        if (ev.isError === true || ev.status === "error" || ev.error) {
          toolErrors++;
        }
      }

      // 3. Evolve Extension Event Detection (Logged via console/audit)
      if (typeof ev.message === "string") {
        const recallMatch = ev.message.match(/\[pi-effect-evolve\] Recalled skill: ([\w-]+)/);
        if (recallMatch?.[1]) recalledSkills.add(recallMatch[1]);

        const crystalMatch = ev.message.match(/\[pi-effect-evolve\] Crystallized skill: ([\w-]+)/);
        if (crystalMatch?.[1]) crystallizedSkills.add(crystalMatch[1]);
      }
    } catch {
      // Non-JSON raw stdout line, ignore or inspect
    }
  }

  // Fallback token calculation if cost is 0 and tokens exist
  if (totalTokens === 0) {
    totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  }

  return {
    usage: {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalTokens,
      cost,
    },
    toolCalls,
    toolErrors,
    turns: Math.max(1, turns),
    recalledSkills: Array.from(recalledSkills),
    crystallizedSkills: Array.from(crystallizedSkills),
    assistantMessages,
  };
}
