---
name: evolve
description: Zero-touch autonomous memory & self-evolution for pi — absorbing GenericAgent (crystallize) & Hermes (GEPA). Runs completely automatically in background (auto-recall, auto-crystallize, implicit feedback, auto-healing), while retaining explicit tools for manual inspection.
---

# Evolve — Zero-Touch Autonomous Memory & Evolution (v2)

**First principles:**
* **Zero Cognitive Overhead**: Evolution should happen in the background without requiring user intervention.
* **Write-Manage-Read Closed Loop**: Successful workflows are auto-crystallized, indexed, contextually recalled, and adaptively pruned.
* **Auto-Healing (GEPA)**: Repeated failure traces induce reflective mutation and self-repair.

## Autonomous Loops

```
1. Auto-Recall:      before_agent_start ──► searchByPrompt() ──► inject Top-2 matching skills
2. Implicit Feedback:agent_end ─────────► recordUsage(slug, !hasErrors)
3. Auto-Crystallize: agent_end ─────────► autoCrystallizeGoal() ──► skills/evolve/<slug>/
4. Auto-Healing:     agent_end ─────────► autoHealFailure() ──► patch existing skill
5. Adaptive Forgetting: session_start ──► prune() ──► deprecate stale (>60d or <30% ok)
```

## Explicit Tools (Manual Inspection)

| Tool | Purpose |
|---|---|
| `evolve_search` | Manually search indexed skills with quality score |
| `evolve_trace` | Inspect structured causal goal traces & errors |
| `evolve_crystallize` | Explicitly write/override a skill recipe |
| `evolve_feedback` | Manually report success/failure score |
| `evolve_gepa` | Manually run diagnosis, variant generation & evaluation |

## Evolution Modes (`PI_EFFECT_EVOLVE_MODE`)

* **`auto` (Default)**: Full zero-touch background operation (auto-crystallize, auto-recall, auto-healing).
* **`conservative`**: Requires manual `evolve_crystallize` calls with UI confirmation dialog.
* **`gepa`**: Queues diagnostic variants to `skills/evolve/_gepa_queue/` for offline review.
