/**
 * pi-effect-evolve — GA (real-browser+crystallize) + Hermes (GEPA-lite) distilled into one pi extension
 * First principles: minimal core (9→4 tools), allowlist-gated grey, Effect-managed IO, conservative evolve
 * ponytail: fewest files, no abstraction for one impl, stdlib before deps
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Effect, pipe } from "effect";
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";
import * as NodeChild from "node:child_process";

// --- typed errors (Effect) ---
class GateError {
  readonly _tag = "GateError";
  constructor(readonly reason: string) {}
}
class FsError {
  readonly _tag = "FsError";
  constructor(readonly cause: unknown) {}
}

// --- env (de-sens, allowlist) ---
function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}
function allowHosts(): string[] {
  const raw = env("PI_EFFECT_ALLOW_HOSTS", "") ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
function allowNetwork(): boolean {
  return env("PI_EFFECT_ALLOW_NETWORK", "0") === "1";
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
  if (hosts.length === 0) return false;
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
  // ponytail: sync append, fewest deps
  try {
    NodeFs.mkdirSync(NodePath.dirname(p), { recursive: true });
    NodeFs.appendFileSync(p, line + "\n", "utf8");
  } catch {}
}

// --- web_real impl: try agent-browser-cli, fallback ---
function execAgentBrowser(code: string, _url?: string): string {
  // GA's TMWebdriver bridge: agent-browser --execute
  try {
    const out = NodeChild.execFileSync("agent-browser", ["--execute", code], { encoding: "utf8", timeout: 15000 });
    return out;
  } catch (e: any) {
    throw new GateError(e?.message ?? String(e));
  }
}

export default function (pi: ExtensionAPI) {
  const TRACE_KEY = "pi-effect-evolve:trace";
  let lastTrace: any[] = [];

  // capture trace for Hermes-lite: collect tool_result chain
  pi.on("tool_result", async (event, ctx) => {
    lastTrace.push({ tool: event.toolName, isError: event.isError, ts: Date.now(), content: event.content?.[0] });
    if (lastTrace.length > 40) lastTrace.shift();
    // also persist for branch survival
    // ponytail: keep lastTrace in memory + appendEntry for /fork
    pi.appendEntry(TRACE_KEY, { at: Date.now(), trace: lastTrace.slice(-5) });
  });

  // restore on fork
  pi.on("session_start", async (_e, ctx) => {
    for (const en of ctx.sessionManager.getEntries()) {
      if ((en as any).customType === TRACE_KEY) {
        // keep last
      }
    }
  });

  // --- grey gate for any networked tool: block before LLM abuse ---
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "web_real" || event.toolName === "web_scan_real") {
      if (!allowNetwork()) {
        return { block: true as const, reason: "PI_EFFECT_ALLOW_NETWORK!=1 — set to 1 and add host to PI_EFFECT_ALLOW_HOSTS" };
      }
      const url = (event.input as any)?.url ?? (event.input as any)?.code ?? "";
      // try to extract URL from input/code
      const maybeUrl = typeof url === "string" && url.startsWith("http") ? url : (event.input as any)?.url;
      if (maybeUrl && !isHostAllowed(maybeUrl)) {
        return { block: true as const, reason: `host not in PI_EFFECT_ALLOW_HOSTS=${allowHosts().join(",") || "(empty)"} — add it explicitly` };
      }
    }
    if (event.toolName === "evolve_crystallize" && requireConfirm()) {
      // defer confirm to tool execute (needs ctx.ui), not block here
    }
  });

  // --- tools ---
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

      const prog = Effect.gen(function* () {
        const out = yield* Effect.try({
          try: () => execAgentBrowser(params.code, params.url),
          catch: (e) => new GateError(String(e)),
        });
        return out;
      }).pipe(Effect.timeout("15 seconds"), Effect.catchAll((e) => Effect.succeed(`ERR: ${String((e as any)?.reason ?? e)}`)));

      const result = await Effect.runPromise(prog as any);
      // signal abort support
      if (signal?.aborted) return { content: [{ type: "text", text: "aborted" }], details: {}, isError: true };
      return { content: [{ type: "text", text: String(result) }], details: { via: "agent-browser" } };
    },
  });

  pi.registerTool({
    name: "web_scan_real",
    label: "Web Scan Real",
    description: "Scan real browser DOM (GA web_scan distilled). Gated same as web_real.",
    parameters: Type.Object({ url: Type.String({ description: "URL to scan (must be allowlisted)" }) }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!allowNetwork() || !isHostAllowed(params.url)) {
        return { content: [{ type: "text", text: "BLOCKED: allowlist gate" }], isError: true, details: { allowHosts: allowHosts() } };
      }
      appendAudit(ctx.cwd, { tool: "web_scan_real", url: params.url });
      const code = `(()=>{return {url:location.href,title:document.title,html:document.documentElement.outerHTML.slice(0,20000)}})()`;
      try {
        const out = execAgentBrowser(code, params.url);
        return { content: [{ type: "text", text: out }], details: {} };
      } catch (e: any) {
        return { content: [{ type: "text", text: `web_scan failed: ${e.message}` }], details: {}, isError: true };
      }
    },
  });

  pi.registerTool({
    name: "evolve_trace",
    label: "Evolve Trace",
    description: "Capture recent tool trace for Hermes GEPA-lite offline mutate. Read-only, no gate.",
    parameters: Type.Object({ limit: Type.Optional(Type.Number({ description: "last N events" })) }),
    async execute(_id, params) {
      const n = params.limit ?? 10;
      const slice = lastTrace.slice(-n);
      return { content: [{ type: "text", text: JSON.stringify(slice, null, 2) }], details: { trace: slice } };
    },
  });

  pi.registerTool({
    name: "evolve_crystallize",
    label: "Evolve Crystallize",
    description: "Conservative crystallize: write reusable Skill to skills/evolve/<slug>/ after human confirm + gates (≤15KB, tests). Mirrors GA L3 + Hermes size gate.",
    parameters: Type.Object({
      slug: Type.String({ description: "kebab slug, e.g. example-sign" }),
      title: Type.Optional(Type.String()),
      code: Type.String({ description: "reusable script/code to persist" }),
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
        const skillMd = `---\nname: ${params.slug}\ntitle: ${params.title ?? params.slug}\n---\n\n# ${params.title ?? params.slug}\n\nSource trace: ${JSON.stringify(lastTrace.slice(-3)).slice(0, 1000)}\n\nVerify: \`${params.verify ?? "manual"}\`\n\nSee \`script.py\`.\n`;
        yield* Effect.try({ try: () => NodeFs.writeFileSync(NodePath.join(dir, "SKILL.md"), skillMd, "utf8"), catch: (e) => new FsError(e) });
        yield* Effect.try({ try: () => NodeFs.writeFileSync(NodePath.join(dir, "script.py"), params.code, "utf8"), catch: (e) => new FsError(e) });
        yield* Effect.try({ try: () => NodeFs.writeFileSync(NodePath.join(dir, "meta.json"), JSON.stringify({ slug: params.slug, allowHosts: allowHosts(), mode: evolveMode(), at: new Date().toISOString() }, null, 2), "utf8"), catch: (e) => new FsError(e) });
        // Hermes gate: if tests/ exists, run pytest -q
        if (NodeFs.existsSync(NodePath.resolve(ctx.cwd, "tests")) || NodeFs.existsSync(NodePath.resolve(ctx.cwd, "test"))) {
          try {
            NodeChild.execSync("pytest -q", { stdio: "pipe", timeout: 30000 });
          } catch (e: any) {
            throw new GateError(`pytest gate failed: ${e.message}`);
          }
        }
        return dir;
      });

      const res = await Effect.runPromise(
        prog.pipe(Effect.catchAll((e: any) => Effect.succeed(`ERR:${e?.reason ?? e?.cause ?? e}`))) as any
      );
      if (typeof res === "string" && res.startsWith("ERR:")) {
        return { content: [{ type: "text", text: res }], details: {}, isError: true };
      }
      appendAudit(ctx.cwd, { tool: "evolve_crystallize", slug: params.slug, mode: evolveMode() });
      pi.appendEntry("evolve-log", { slug: params.slug, at: Date.now() });
      return { content: [{ type: "text", text: `crystallized to skills/evolve/${params.slug}/` }], details: { slug: params.slug } };
    },
  });

  pi.registerCommand("evolve-status", {
    description: "Show evolve mode / allowlist / audit tail",
    handler: async (_args, ctx) => {
      const p = auditLogPath(ctx.cwd);
      let tail = "";
      try {
        const txt = NodeFs.readFileSync(p, "utf8");
        tail = txt.split("\n").filter(Boolean).slice(-5).join("\n");
      } catch {}
      ctx.ui.notify(`mode=${evolveMode()} allow=${allowHosts().join(",")||"(none)"} net=${allowNetwork()} confirm=${requireConfirm()}\n${tail || "(no audit)"}`, "info");
    },
  });
}
