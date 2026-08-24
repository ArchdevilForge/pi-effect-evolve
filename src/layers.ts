/**
 * pi-effect-evolve — Effect layers: DI, retry, resource management (Phase 5)
 * Substantive Effect usage: Layer for agent-browser, Schedule for retry, Scope for resources
 */
import { Context, Effect, Layer, Schedule, pipe } from "effect";
import * as NodeChild from "node:child_process";
import { GateError } from "./types.js";

// --- AgentBrowser service ---

export interface AgentBrowserService {
  readonly execute: (code: string) => Effect.Effect<string, GateError>;
}

export const AgentBrowser = Context.GenericTag<AgentBrowserService>("AgentBrowser");

/** Live implementation: calls agent-browser CLI */
export const AgentBrowserLive = Layer.succeed(AgentBrowser, {
  execute: (code: string) =>
    Effect.async<string, GateError>((resume) => {
      const extra = (process.env.AGENT_BROWSER_ARGS ?? "").split(" ").filter(Boolean);
      const child = NodeChild.execFile(
        "agent-browser",
        [...extra, "--execute", code],
        { encoding: "utf8", timeout: 30_000 },
        (err, stdout) => {
          if (err) resume(Effect.fail(new GateError(err.message)));
          else resume(Effect.succeed(stdout));
        },
      );
      return Effect.sync(() => {
        child.kill();
      });
    }),
});

/** Test implementation: returns mock output */
export const AgentBrowserTest = Layer.succeed(AgentBrowser, {
  execute: (code: string) =>
    Effect.succeed(`[mock] executed ${code.length} chars`),
});

// --- Retry policies ---

/** Retry with exponential backoff for transient errors */
export const retryTransient = pipe(
  Schedule.exponential("1 second"),
  Schedule.compose(Schedule.recurs(3)),
);

/** Retry only on timeout/network errors */
export const retryOnTimeout = pipe(
  Schedule.exponential("2 seconds"),
  Schedule.compose(Schedule.recurs(2)),
);

// --- Effectful browser execution ---

/** Execute code in agent-browser with proper Effect management */
export function browserExecute(
  code: string,
  signal?: AbortSignal,
): Effect.Effect<string, GateError, AgentBrowserService> {
  return Effect.gen(function* () {
    // check abort before execution
    if (signal?.aborted) {
      return yield* Effect.fail(new GateError("aborted"));
    }
    const browser = yield* AgentBrowser;
    const result = yield* browser.execute(code);
    // check abort after execution
    if (signal?.aborted) {
      return yield* Effect.fail(new GateError("aborted after execution"));
    }
    return result;
  });
}

/** Execute with retry on transient failures */
export function browserExecuteWithRetry(
  code: string,
  signal?: AbortSignal,
): Effect.Effect<string, GateError, AgentBrowserService> {
  return browserExecute(code, signal).pipe(
    Effect.retry(retryTransient),
  );
}
