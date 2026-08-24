---
name: evolve
description: First-principles self-evolution for pi — GA crystallize (ops) + Hermes GEPA-lite (reasoning) + memory W-M-R loop. Use when user asks to evolve/crystallize/mutate a Skill, after a successful code_run/bash that deserves persistence, or to diagnose failures and auto-improve.
---

# Evolve — GA + Hermes distilled for pi (v2)

**First principles:**
* Thing that must persist = *reproducible recipe* (code + verify cmd + allowlist). Not chat transcript.
* Two evolutions: **Crystallize** (GA, cheap, immediate) vs **GEPA Mutate** (Hermes, expensive, gated). Default to Crystallize.
* Gates before write: `success` + `human confirm` + `≤15KB` + `tests pass if any` + `allowlist audit`.
* Memory is a **Write-Manage-Read closed loop** — skills are indexed, searchable, and auto-pruned.

## Architecture

```
Write:  evolve_crystallize → skills/evolve/<slug>/ + .index.json
Manage: session_start → SkillMemory.prune() → deprecate stale, archive old
Read:   before_agent_start → inject contextSummary() into system prompt
        evolve_search → keyword + quality-ranked retrieval
Feedback: evolve_feedback → track success/failure → feeds pruning
```

## Workflow

1. **Capture** — `tool_result` events → `TraceStore` (goal-aware, causal, structured errors)
2. **Gate** — `evolve_crystallize` checks:
   * `PI_EFFECT_ALLOW_HOSTS` allowlist (if networked)
   * `PI_EFFECT_EVOLVE_MODE=conservative` → `ctx.ui.confirm("Crystallize?")` must pass
   * skill `≤PI_EFFECT_SKILL_MAX_KB` (default 15)
   * if `tests/` exists, `pytest -q` must pass (Hermes gate)
3. **Write** — `skills/evolve/<slug>/SKILL.md` + `script.py` + `meta.json`
4. **Index** — `SkillMemory.register()` → `.index.json` with tags, timestamps
5. **Append** — `pi.appendEntry("evolve-log", meta)` survives `/fork` branch

## Tools

| Tool | Purpose | Gate |
|---|---|---|
| `evolve_crystallize` | Write reusable skill | confirm + size + tests |
| `evolve_trace` | Inspect structured traces | read-only |
| `evolve_search` | Find existing skills | read-only |
| `evolve_feedback` | Record success/failure | none |
| `evolve_gepa` | Run GEPA pipeline | mode=auto/gepa |

## When to use

* user: `crystallize this` / `save as skill` / `evolve this flow`
* tool_result `code_run`/`bash` success that is clearly reusable
* `evolve_search` to check if a similar skill already exists before re-solving

## When NOT to

* failure / partial success — kill, don't evolve
* networked target not in `ALLOW_HOSTS` — block, ask to add host explicitly
* duplicate — search first, update existing skill

## GEPA-lite (opt-in)

`PI_EFFECT_EVOLVE_MODE=gepa` enables:
1. `evolve_trace` captures structured traces with error categories
2. `evolve_gepa` runs: diagnose failures → generate variants → evaluate → select best
3. Results queued to `skills/evolve/_gepa_queue/` for review
4. `--autoApply` applies best variant with human confirm

## Adaptive Forgetting

On each `session_start`:
1. Load `.index.json`
2. Deprecate skills: unused >60 days OR success rate <30% with ≥3 uses
3. Archive deprecated skills after 90 days → `.archive/`
4. Excluded from search and context injection
