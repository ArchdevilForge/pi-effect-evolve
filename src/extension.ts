/**
 * pi-effect-evolve — GA (real-browser+crystallize) + Hermes (GEPA-lite) distilled into one pi extension
 * First principles: minimal core, allowlist-gated grey, Effect-managed IO, conservative evolve
 *
 * Phase 1: Write-Manage-Read closed loop (SkillMemory)
 * Phase 2: Structured trace (TraceStore)
 * Phase 3: Adaptive forgetting (SkillMemory.prune)
 * Phase 4: GEPA-lite pipeline (diagnose → mutate → evaluate → select)
 * Phase 5: Effect layers (AgentBrowser service, retry policies)
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Effect, pipe } from "effect";
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";
import * as NodeChild from "node:child_process";

import { GateError, FsError } from "./types.js";
import { TraceStore } from "./trace.js";
import { SkillMemory } from "./memory.js";
import { gepaPipeline, queueForReview } from "./gepa.js";
import { AgentBrowser, AgentBrowserLive, browserExecute, browserExecuteWithRetry } from "./layers.js";

// --- env (de-sens, allowlist) ---
function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}
function allowHosts(): string[] {
  const raw = env("PI_EFFECT_ALLOW_HOSTS", "*") ?? "*";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
function allowNetwork(): boolean {
  return env("PI_EFFECT_ALLOW_NETWORK", "1") === "1";
}
function requireConfirm(): boolean {
  return env("PI_EFFECT_REQUIRE_CONFIRM", "1") !== "0";
}
function evolveMode(): string {
  return env("PI_EFFECT_EVOLVE_MODE", "conservative") ?? "conservative";
}
function skillMaxKb(): number {
  return Number(env("PI_EFFECT_SKILL_MAX_KB", "15") ?? 15);
}
function auditLogPath(cwd: string): string {
  return NodePath.resolve(cwd, env("PI_EFFECT_AUDIT_LOG", ".pi/evolve-audit.jsonl") ?? ".pi/evolve-audit.jsonl");
}
function isHostAllowed(url: string): boolean {
  const hosts = allowHosts();
  if (hosts.length === 0 || hosts.includes("*")) return true;
  try {
    const h = new URL(url).host;
    return hosts.some((pat) => {
      if (pat === "*") return true;
      if (pat.startsWith("*.")) return h === pat.slice(2) || h.endsWith(pat.slice(1));
      return h === pat;
    });
  } catch {
    return false;
  }
}

function appendAudit(cwd: string, entry: Record<string, unknown>) {
  const p = auditLogPath(cwd);
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  try {
    NodeFs.mkdirSync(NodePath.dirname(p), { recursive: true });
    NodeFs.appendFileSync(p, line + "\n", "utf8");
  } catch {}
}

export default function (pi: ExtensionAPI) {
  const TRACE_KEY = "pi-effect-evolve:trace";

  // Phase 2: structured trace store
  const trace = new TraceStore();

  // Phase 1+3: skill memory (initialized lazily per cwd)
  let memory: SkillMemory | undefined;
  function getMemory(cwd: string): SkillMemory {
    if (!memory) {
      memory = new SkillMemory(NodePath.resolve(cwd, "skills/evolve"));
    }
    return memory;
  }

  // Phase 2: capture structured trace from tool results
  pi.on("tool_result", async (event, _ctx) => {
    const startTs = Date.now();
    const errorCategory = event.isError
      ? (event.content?.[0]?.type === "text" && typeof event.content[0].text === "string"
          ? categorizeError(event.content[0].text)
          : "runtime" as const)
      : undefined;
    const errorDetail = event.isError && event.content?.[0]?.type === "text"
      ? (event.content[0].text as string).slice(0, 500)
      : undefined;

    trace.record({
      tool: event.toolName,
      input: event.input ?? {},
      output: event.content?.[0]?.type === "text" ? (event.content[0].text as string) : "",
      isError: event.isError,
      errorCategory,
      errorDetail,
      durationMs: Date.now() - startTs,
    });
    // persist trace for branch survival
    pi.appendEntry(TRACE_KEY, { at: Date.now(), summary: trace.summary(3) });
  });

  // Phase 2: start goal on user input (turn_start)
  pi.on("turn_start", async (_event, _ctx) => {
    trace.startGoal("user-turn");
  });

  // Phase 2: end goal on turn end
  pi.on("turn_end", async (_event, _ctx) => {
    const goal = trace.activeGoal();
    if (goal) {
      const hasErrors = goal.events.some((e) => e.isError);
      trace.endGoal(hasErrors ? "partial" : "success");
    }
  });

  // Restore trace + prune on session start
  pi.on("session_start", async (_e, ctx) => {
    trace.restore(ctx.cwd);
    const mem = getMemory(ctx.cwd);
    // Phase 3: adaptive forgetting — prune stale skills on session start
    const { deprecated, archived } = mem.prune();
    if (deprecated.length > 0 || archived.length > 0) {
      appendAudit(ctx.cwd, { event: "prune", deprecated, archived });
    }
  });

  // Phase 1 (Read): inject skill context into system prompt
  pi.on("before_agent_start", async (event, ctx) => {
    const mem = getMemory(ctx.cwd);
    const summary = mem.contextSummary();
    const traceSummary = trace.summary(3);
    const extra = [summary, traceSummary].filter(Boolean).join("\n\n");
    if (extra) {
      return { systemPrompt: event.systemPrompt + "\n\n" + extra };
    }
  });

  // Persist trace on shutdown
  pi.on("session_shutdown", async (_e, ctx) => {
    trace.persist(ctx.cwd);
  });

  // --- grey gate for any networked tool: block before LLM abuse ---
  pi.on("tool_call", async (event, _ctx) => {
    if (event.toolName === "web_real" || event.toolName === "web_scan_real") {
      if (!allowNetwork()) {
        return { block: true as const, reason: "PI_EFFECT_ALLOW_NETWORK!=1 — set to 1 and add host to PI_EFFECT_ALLOW_HOSTS" };
      }
      const url = (event.input as Record<string, unknown>)?.url ?? (event.input as Record<string, unknown>)?.code ?? "";
      const maybeUrl = typeof url === "string" && url.startsWith("http") ? url : (event.input as Record<string, unknown>)?.url;
      if (typeof maybeUrl === "string" && !isHostAllowed(maybeUrl)) {
        return { block: true as const, reason: `host not in PI_EFFECT_ALLOW_HOSTS=${allowHosts().join(",") || "(empty)"} — add it explicitly` };
      }
    }
  });

  // --- tools ---

  // Phase 5: web_real with Effect Layer + retry
  pi.registerTool({
    name: "web_real",
    label: "Web Real",
    description: "Execute JS in real persistent Chrome via agent-browser-cli (GA TMWebdriver). Gated by PI_EFFECT_ALLOW_HOSTS/ALLOW_NETWORK. Fallback to error if bridge missing.",
    parameters: Type.Object({
      code: Type.String({ description: "JS code to execute in page context, return value is captured" }),
      url: Type.Optional(Type.String({ description: "Optional URL hint for allowlist check" })),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      if (!allowNetwork()) {
        return { content: [{ type: "text", text: "BLOCKED: PI_EFFECT_ALLOW_NETWORK!=1" }], details: { blocked: true }, isError: true };
      }
      if (params.url && !isHostAllowed(params.url)) {
        return { content: [{ type: "text", text: `BLOCKED: host not in ALLOW_HOSTS` }], details: { blocked: true, allowHosts: allowHosts() }, isError: true };
      }
      appendAudit(ctx.cwd, { tool: "web_real", url: params.url, codeLen: params.code.length });

      // Phase 5: Effect-managed execution with Layer DI + retry
      const prog = browserExecuteWithRetry(params.code, signal ?? undefined).pipe(
        Effect.provide(AgentBrowserLive),
        Effect.timeout("30 seconds"),
        Effect.catchAll((e) => Effect.succeed(`ERR: ${String((e as GateError)?.reason ?? e)}`)),
      );

      const result = await Effect.runPromise(prog);
      if (signal?.aborted) return { content: [{ type: "text", text: "aborted" }], details: {}, isError: true };
      return { content: [{ type: "text", text: String(result) }], details: { via: "agent-browser" } };
    },
  });

  pi.registerTool({
    name: "web_scan_real",
    label: "Web Scan Real",
    description: "Scan real browser DOM (GA web_scan distilled). Gated same as web_real.",
    parameters: Type.Object({ url: Type.String({ description: "URL to scan (must be allowlisted)" }) }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      if (!allowNetwork() || !isHostAllowed(params.url)) {
        return { content: [{ type: "text", text: "BLOCKED: allowlist gate" }], isError: true, details: { allowHosts: allowHosts() } };
      }
      appendAudit(ctx.cwd, { tool: "web_scan_real", url: params.url });
      const code = `(()=>{return {url:location.href,title:document.title,html:document.documentElement.outerHTML.slice(0,20000)}})()`;

      // Phase 5: Effect-managed execution
      const prog = browserExecute(code, signal ?? undefined).pipe(
        Effect.provide(AgentBrowserLive),
        Effect.timeout("30 seconds"),
        Effect.catchAll((e) => Effect.succeed(`ERR: ${String((e as GateError)?.reason ?? e)}`)),
      );

      const result = await Effect.runPromise(prog);
      if (typeof result === "string" && result.startsWith("ERR:")) {
        return { content: [{ type: "text", text: result }], details: {}, isError: true };
      }
      return { content: [{ type: "text", text: String(result) }], details: {} };
    },
  });

  // Phase 2: structured trace tool (replaces old evolve_trace)
  pi.registerTool({
    name: "evolve_trace",
    label: "Evolve Trace",
    description: "Capture recent structured trace for Hermes GEPA-lite offline mutate. Shows goal-aware, causal trace with error categories. Read-only, no gate.",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "last N events" })),
      goalId: Type.Optional(Type.String({ description: "specific goal ID to inspect" })),
    }),
    async execute(_id, params) {
      const n = params.limit ?? 10;
      const events = trace.getEvents(n, params.goalId);
      const goals = trace.getGoals();
      const summary = trace.summary(n);
      return {
        content: [{ type: "text", text: JSON.stringify({ summary, eventCount: events.length, goalCount: goals.length, events }, null, 2) }],
        details: { events, goals: goals.map((g) => ({ goalId: g.goalId, description: g.description, outcome: g.outcome, eventCount: g.events.length })) },
      };
    },
  });

  // Phase 1+2+3+5: crystallize with full memory integration
  pi.registerTool({
    name: "evolve_crystallize",
    label: "Evolve Crystallize",
    description: "Conservative crystallize: write reusable Skill to skills/evolve/<slug>/ after human confirm + gates (≤15KB, tests). Registers in skill index for future retrieval. Mirrors GA L3 + Hermes size gate.",
    parameters: Type.Object({
      slug: Type.String({ description: "kebab slug, e.g. example-sign" }),
      title: Type.Optional(Type.String()),
      code: Type.String({ description: "reusable script/code to persist" }),
      tags: Type.Optional(Type.Array(Type.String(), { description: "searchable tags for skill retrieval" })),
      verify: Type.Optional(Type.String({ description: "verify command, e.g. 'python verify.py'" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      // conservative gate
      if (requireConfirm()) {
        const ok = await ctx.ui.confirm("Crystallize?", `Write skills/evolve/${params.slug}/ ? ${params.code.length} chars, max ${skillMaxKb()}KB`);
        if (!ok) return { content: [{ type: "text", text: "cancelled by human" }], details: {}, isError: true };
      }
      const maxBytes = skillMaxKb() * 1024;
      if (Buffer.byteLength(params.code, "utf8") > maxBytes) {
        return { content: [{ type: "text", text: `BLOCKED: skill >${skillMaxKb()}KB gate (Hermes)` }], details: {}, isError: true };
      }
      const prog = Effect.gen(function* () {
        const dir = NodePath.resolve(ctx.cwd, "skills/evolve", params.slug);
        yield* Effect.try({ try: () => NodeFs.mkdirSync(dir, { recursive: true }), catch: (e) => new FsError(e) });

        // Phase 2: include structured trace in skill metadata
        const recentTrace = trace.summary(5);
        const skillMd = `---\nname: ${params.slug}\ntitle: ${params.title ?? params.slug}\ntags: [${(params.tags ?? []).join(", ")}]\n---\n\n# ${params.title ?? params.slug}\n\nSource trace:\n${recentTrace}\n\nVerify: \`${params.verify ?? "manual"}\`\n\nSee \`script.py\`.\n`;
        yield* Effect.try({ try: () => NodeFs.writeFileSync(NodePath.join(dir, "SKILL.md"), skillMd, "utf8"), catch: (e) => new FsError(e) });
        yield* Effect.try({ try: () => NodeFs.writeFileSync(NodePath.join(dir, "script.py"), params.code, "utf8"), catch: (e) => new FsError(e) });
        yield* Effect.try({ try: () => NodeFs.writeFileSync(NodePath.join(dir, "meta.json"), JSON.stringify({ slug: params.slug, tags: params.tags ?? [], allowHosts: allowHosts(), mode: evolveMode(), at: new Date().toISOString() }, null, 2), "utf8"), catch: (e) => new FsError(e) });
        // Hermes gate: if tests/ exists, run pytest -q
        if (NodeFs.existsSync(NodePath.resolve(ctx.cwd, "tests")) || NodeFs.existsSync(NodePath.resolve(ctx.cwd, "test"))) {
          try {
            NodeChild.execSync("pytest -q", { stdio: "pipe", timeout: 30000 });
          } catch (e: unknown) {
            throw new GateError(`pytest gate failed: ${(e as Error).message}`);
          }
        }
        return dir;
      });

      const res = await Effect.runPromise(
        prog.pipe(Effect.catchAll((e: GateError | FsError) => Effect.succeed(`ERR:${(e as GateError)?.reason ?? (e as FsError)?.cause ?? e}`)))
      );
      if (typeof res === "string" && res.startsWith("ERR:")) {
        return { content: [{ type: "text", text: res }], details: {}, isError: true };
      }

      // Phase 1: register in skill index for retrieval
      const mem = getMemory(ctx.cwd);
      mem.register({
        slug: params.slug,
        title: params.title ?? params.slug,
        tags: params.tags ?? [],
        createdAt: new Date().toISOString(),
        sizeBytes: Buffer.byteLength(params.code, "utf8"),
      });

      appendAudit(ctx.cwd, { tool: "evolve_crystallize", slug: params.slug, mode: evolveMode(), tags: params.tags });
      pi.appendEntry("evolve-log", { slug: params.slug, at: Date.now() });
      return { content: [{ type: "text", text: `crystallized to skills/evolve/${params.slug}/ (indexed)` }], details: { slug: params.slug, indexed: true } };
    },
  });

  // Phase 1: skill search tool
  pi.registerTool({
    name: "evolve_search",
    label: "Evolve Search",
    description: "Search crystallized skills by keyword. Returns matching skills ranked by relevance + quality signals (success rate, recency, frequency).",
    parameters: Type.Object({
      query: Type.String({ description: "search query (matches slug, title, tags)" }),
      limit: Type.Optional(Type.Number({ description: "max results (default 5)" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const mem = getMemory(ctx.cwd);
      const results = mem.search(params.query, params.limit ?? 5);
      if (results.length === 0) {
        return { content: [{ type: "text", text: `No skills found for "${params.query}"` }], details: { results: [] } };
      }
      const text = results.map((r) => {
        const rate = r.useCount > 0 ? Math.round((r.successCount / r.useCount) * 100) : -1;
        return `- ${r.slug}: ${r.title} [${r.tags.join(",")}] used=${r.useCount}${rate >= 0 ? " ok=" + rate + "%" : ""}`;
      }).join("\n");
      return { content: [{ type: "text", text }], details: { results } };
    },
  });

  // Phase 1: record skill usage
  pi.registerTool({
    name: "evolve_feedback",
    label: "Evolve Feedback",
    description: "Record success/failure feedback for a crystallized skill. Feeds adaptive forgetting: low-success skills get deprecated over time.",
    parameters: Type.Object({
      slug: Type.String({ description: "skill slug to report on" }),
      success: Type.Boolean({ description: "true if skill worked, false if it failed" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const mem = getMemory(ctx.cwd);
      mem.recordUsage(params.slug, params.success);
      appendAudit(ctx.cwd, { tool: "evolve_feedback", slug: params.slug, success: params.success });
      return { content: [{ type: "text", text: `recorded ${params.success ? "success" : "failure"} for ${params.slug}` }], details: {} };
    },
  });

  // Phase 4: GEPA evolve tool
  pi.registerTool({
    name: "evolve_gepa",
    label: "Evolve GEPA",
    description: "Run GEPA-lite pipeline: diagnose failed traces → generate skill variants → evaluate → select best. Requires PI_EFFECT_EVOLVE_MODE=gepa or auto. Results queued for review.",
    parameters: Type.Object({
      autoApply: Type.Optional(Type.Boolean({ description: "auto-apply best variant (default false, queue for review)" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const mode = evolveMode();
      if (mode === "conservative") {
        return { content: [{ type: "text", text: "BLOCKED: PI_EFFECT_EVOLVE_MODE=conservative — set to 'auto' or 'gepa' to enable" }], details: {}, isError: true };
      }

      const failedGoals = trace.getFailedGoals();
      if (failedGoals.length === 0) {
        return { content: [{ type: "text", text: "No failed goals in trace — nothing to evolve" }], details: {} };
      }

      const mem = getMemory(ctx.cwd);
      const results = gepaPipeline(failedGoals, mem, skillMaxKb());

      if (results.length === 0) {
        return { content: [{ type: "text", text: "GEPA: no actionable diagnoses found" }], details: {} };
      }

      // queue for review (safe default)
      const queueFile = queueForReview(ctx.cwd, results);

      // auto-apply if requested and gates pass
      const applied: string[] = [];
      if (params.autoApply) {
        for (const r of results) {
          if (r.gatesPassed && r.selected) {
            const ok = requireConfirm()
              ? await ctx.ui.confirm("Apply GEPA variant?", `${r.selected.slug}: ${r.selected.rationale}`)
              : true;
            if (ok) {
              const dir = NodePath.resolve(ctx.cwd, "skills/evolve", r.selected.slug);
              NodeFs.mkdirSync(dir, { recursive: true });
              NodeFs.writeFileSync(NodePath.join(dir, "script.py"), r.selected.code, "utf8");
              NodeFs.writeFileSync(NodePath.join(dir, "SKILL.md"), `---\nname: ${r.selected.slug}\ntitle: GEPA variant\ntags: [gepa, auto]\n---\n\n# ${r.selected.slug}\n\n${r.selected.rationale}\n\nDiagnosis: ${r.diagnosis.failurePattern}\nRoot cause: ${r.diagnosis.rootCause}\n`, "utf8");
              NodeFs.writeFileSync(NodePath.join(dir, "meta.json"), JSON.stringify({ slug: r.selected.slug, gepa: true, score: r.selected.score, at: new Date().toISOString() }, null, 2), "utf8");
              mem.register({
                slug: r.selected.slug,
                title: `GEPA: ${r.selected.rationale.slice(0, 50)}`,
                tags: ["gepa", "auto"],
                createdAt: new Date().toISOString(),
                sizeBytes: Buffer.byteLength(r.selected.code, "utf8"),
              });
              applied.push(r.selected.slug);
            }
          }
        }
      }

      appendAudit(ctx.cwd, { tool: "evolve_gepa", diagnoses: results.length, applied: applied.length, queueFile });

      const summary = results.map((r) =>
        `• ${r.diagnosis.failurePattern}: ${r.diagnosis.rootCause.slice(0, 80)}${r.selected ? ` → ${r.selected.slug} (score=${r.selected.score})` : " (no variant passed)"}`
      ).join("\n");

      return {
        content: [{ type: "text", text: `GEPA: ${results.length} diagnoses, ${applied.length} applied\n${summary}\nQueued: ${queueFile}` }],
        details: { results: results.length, applied, queueFile },
      };
    },
  });

  // --- commands ---

  pi.registerCommand("evolve-status", {
    description: "Show evolve mode / allowlist / skill stats / audit tail",
    handler: async (_args, ctx) => {
      const mem = getMemory(ctx.cwd);
      const stats = mem.stats();
      const p = auditLogPath(ctx.cwd);
      let tail = "";
      try {
        const txt = NodeFs.readFileSync(p, "utf8");
        tail = txt.split("\n").filter(Boolean).slice(-5).join("\n");
      } catch {}
      ctx.ui.notify(
        `mode=${evolveMode()} allow=${allowHosts().join(",") || "(none)"} net=${allowNetwork()} confirm=${requireConfirm()}\n` +
        `skills: ${stats.active} active, ${stats.deprecated} deprecated, avg_ok=${stats.avgSuccessRate}%\n` +
        `trace: ${trace.getGoals().length} goals, ${trace.getEvents(999).length} events\n` +
        `${tail || "(no audit)"}`,
        "info",
      );
    },
  });
}

// --- helpers ---

function categorizeError(text: string): "gate" | "timeout" | "runtime" | "validation" | "network" {
  const t = text.toLowerCase();
  if (t.includes("blocked") || t.includes("allowlist") || t.includes("gate")) return "gate";
  if (t.includes("timeout") || t.includes("timed out") || t.includes("etimedout")) return "timeout";
  if (t.includes("enotfound") || t.includes("econnrefused") || t.includes("network")) return "network";
  if (t.includes("validation") || t.includes("invalid") || t.includes("schema")) return "validation";
  return "runtime";
}
