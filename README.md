# pi-effect-evolve

> **First-principles plug for `pi` that absorbs `GenericAgent` (real-browser + crystallize) & `Hermes` (GEPA trace-evolve) — without re-shipping their monoliths.**

`pi` = `read/write/edit/bash` harness. `GA` = `~3K` line seed that injects **real Chrome** (`TMWebdriver`) & **auto-crystallizes** every success into `L3 Skill`. `Hermes` = `DSPy+GEPA` that mutates `Prompt/Skill` from **execution traces** through `tests/size/cache` gates. Both prove self-evolution works — just at different layers (`ops` vs `reasoning`).

This package keeps the **first-principles kernel** and gates the grey area.

## Why not just use GA/Hermes

* you love `pi`'s `TS extension + session tree + 30+ providers` and want **one harness**
* you need `GA`'s `56/56 anti-bot` real session but inside `pi`'s `bash` flow
* you want `Hermes`' `trace→mutate→gate→PR` loop, not blind auto-write

## Principles (grilled)

1. **Allowlist-gated** — no `PI_EFFECT_ALLOW_HOSTS` + `PI_EFFECT_ALLOW_NETWORK=1` → every networked `web_real` is **blocked** (`block:true`) before LLM call.
2. **Conservative crystallize** — `PI_EFFECT_EVOLVE_MODE=conservative` (default): only `code_run/bash` success + **human `ctx.ui.confirm`** → write to `skills/evolve/`. `auto` / `gepa` are opt-in.
3. **Hermes-lite gates** — skill `≤15KB`, `pytest -q` must pass if `tests/` exists, no mid-conversation file churn, audit `JSONL` per write.
4. **Effect-managed IO** — `Effect` owns `retry/scope/typed errors`; pi events stay abort-aware (`ctx.signal`).

## Install

```bash
pi install @archdevil/pi-effect-evolve
# or project-local
pi install -l @archdevil/pi-effect-evolve
# quick trial
pi -e @archdevil/pi-effect-evolve
```

Configure (de-sensitized):
```bash
cp .env.example .env
# fill PI_EFFECT_ALLOW_HOSTS=example.com PI_EFFECT_ALLOW_NETWORK=1
```

## Tools added

| Tool | Grey gate |
|---|---|
| `web_real` | `allowlist` + `ALLOW_NETWORK` |
| `web_scan_real` | same |
| `evolve_crystallize` | `REQUIRE_CONFIRM` + skill size gate |
| `evolve_trace` | read-only trace capture for GEPA input |

Skills auto-injected:
* `skills/evolve/SKILL.md` — when to crystallize vs mutate
* `skills/web-real/SKILL.md` — real-browser playbook (hook→replay→crystallize)

## Usage

Pi prompt:
```
use web_real to observe https://example.com and extract the signing chain, then crystallize
```
Pi will: `web_real` (gated) → `bash` PoC → `evolve_crystallize` (asks `Allow Crystallize?`) → writes `skills/evolve/example-sign/SKILL.md` → `pi.appendEntry` audit.

Evolve towards GEPA later:
```
set PI_EFFECT_EVOLVE_MODE=gepa && pi
```

## De-sens & Open-source

* `.env.example` is committed, real `.env` / `mykey.py` / `sessions/` are gitignored
* demo Skill in `skills/evolve/_example/` hits `example.com` only
* no hard-coded target/host/cookie/token — see `.env.example`
* MIT, keep `LICENSE` notice, run `npm run check && npm test` before PR

## Effect stack

* `effect 3.22.1` + `@effect/platform-node` — `Effect.gen`/`Layer`/`Schedule`/`Scope` for all IO
* `typebox` schemas for tool params (same as pi core)
* peer on `pi` `0.84.2`

## Grey-area notice

> This repo ships **capability, not bypass**. Any `web_real` call is allowlist-blocked by default. Maintainer grilling: *one full-open Tool the LLM can call arbitrarily is one `rm -rf ~` away from abuse* — gate it, log it, confirm it. For private org use, fork and set `PI_EFFECT_ALLOW_HOSTS=*` at your own risk.
