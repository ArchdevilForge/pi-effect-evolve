/**
 * Accurate Parser for Pi JSONL stream events (--mode json)
 *
 * Rules:
 * 1. Token Usage & Cost: ONLY collected on authoritative `message_end` from assistant messages.
 * 2. Turns: ONLY incremented on `turn_end`.
 * 3. Tool Calls & Errors: ONLY collected on `tool_execution_end`.
 */
import type { PiExecutionUsage } from "./types.js";

export interface ParsedPiRun {
  usage: PiExecutionUsage;
  toolCalls: number;
  toolErrors: number;
  turns: number;
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
  const assistantMessages: string[] = [];

  for (const line of lines) {
    try {
      const ev = JSON.parse(line);

      // 1. Authoritative Token & Cost Accounting (Only on assistant message_end)
      if (ev.type === "message_end") {
        const isAssistant = ev.message?.role === "assistant" || ev.role === "assistant";
        if (isAssistant) {
          const u = ev.usage ?? ev.message?.usage;
          if (u) {
            inputTokens += Number(u.inputTokens ?? u.input_tokens ?? u.input ?? 0);
            outputTokens += Number(u.outputTokens ?? u.output_tokens ?? u.output ?? 0);
            cacheReadTokens += Number(u.cacheReadTokens ?? u.cache_read_tokens ?? u.cacheRead ?? 0);
            cacheWriteTokens += Number(u.cacheWriteTokens ?? u.cache_write_tokens ?? u.cacheWrite ?? 0);
            totalTokens += Number(u.totalTokens ?? u.total_tokens ?? 0);
            const rawCost = ev.cost ?? u.cost ?? ev.message?.cost;
            if (typeof rawCost === "number") {
              if (Number.isFinite(rawCost)) cost += rawCost;
            } else if (rawCost && typeof rawCost === "object") {
              const total = Number(rawCost.total ?? 0);
              if (Number.isFinite(total)) cost += total;
            }
          }

          if (typeof ev.message?.content === "string") {
            assistantMessages.push(ev.message.content);
          }
        }
      }

      // 2. Authoritative Turns Counting (Only on turn_end)
      if (ev.type === "turn_end") {
        turns++;
      }

      // 3. Tool Calls & Tool Errors Accounting (Only on tool_execution_end)
      if (ev.type === "tool_execution_end") {
        toolCalls++;
        if (ev.isError === true || ev.status === "error" || ev.error) {
          toolErrors++;
        }
      }
    } catch {
      // Non-JSON line ignored
    }
  }

  // Fallback total calculation if not provided by provider
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
    assistantMessages,
  };
}
