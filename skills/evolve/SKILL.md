---
name: evolve
description: First-principles self-evolution for pi — GA crystallize (ops) + Hermes GEPA-lite (reasoning). Use when user asks to evolve/crystallize/mutate a Skill, or after a successful code_run/bash that deserves L3 persistence.
---

# Evolve — GA + Hermes distilled for pi

**First principles:**
* Thing that must persist = *reproducible recipe* (code + verify cmd + allowlist). Not chat transcript.
* Two evolutions: **Crystallize** (GA, cheap, immediate) vs **Mutate** (Hermes, expensive, gated). Default to Crystallize.
* Gates before L3 write: `success` + `human confirm` + `≤15KB` + `tests pass if any` + `allowlist audit`.

## Workflow

1. **Capture** — `evolve_trace` records `tool_result` chain (code, output, exit).
2. **Gate** — `evolve_crystallize` checks:
   * `PI_EFFECT_ALLOW_HOSTS` allowlist (if networked)
   * `PI_EFFECT_EVOLVE_MODE=conservative` → `ctx.ui.confirm("Crystallize?")` must pass
   * skill `≤PI_EFFECT_SKILL_MAX_KB` (default 15)
   * if `tests/` exists, `pytest -q` must pass (Hermes gate)
3. **Write** — `skills/evolve/<slug>/SKILL.md` + `script.py`/`verify.sh` + `meta.json` (allowlist, source trace id)
4. **Append** — `pi.appendEntry("evolve-log", meta)` survives `/fork` branch

## When to use

* user: `crystallize this` / `save as skill` / `evolve this flow`
* tool_result `code_run`/`bash` success that is clearly reusable (e.g., signing hook, DB decrypt)

## When NOT to

* failure / partial success — kill, don't evolve
* networked target not in `ALLOW_HOSTS` — block, ask to add host explicitly
* `gepa` mode requested — collect traces into `skills/evolve/_gepa_queue/` for offline mutate, don't auto-mutate live

## GEPA-lite (opt-in)

`PI_EFFECT_EVOLVE_MODE=gepa` → `evolve_trace` batches traces, offline job does `read skill → propose variant → eval → gate → PR`. Pi never mutates live without `tests` gate. Hermes paper: `read→eval dataset→GEPA→variants→gates→PR`.

## Example

User: `use web_real to hook example.com signing`
1. `web_real` (allowlist-gated)
2. `bash` PoC verifies locally
3. `evolve_crystallize --slug example-sign --source trace-xxx` (confirm → write)
