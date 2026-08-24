# pi-effect-evolve

> **Distilled self-evolving memory runtime for `pi` — absorbing GenericAgent (real-browser + skill crystallization) & Hermes (GEPA trace-mutation) in an Effect-managed harness.**

---

## ⚡ Why pi-effect-evolve

* **Full-Loop Memory (W-M-R)**: Auto-indexes crystallized skills, retrieves them contextually, and adaptively prunes stale entries.
* **Causal Trace Logging**: Replaces untyped ring buffers with goal-aware, parent-linked traces and error categorization.
* **GEPA-Lite Optimization**: Offline failure diagnosis, reflective mutation, and size-gated variant selection.
* **Effect IO Kernel**: Typed error channels, Schedule-based retries, Layer dependency injection, and signal-aware aborts.
* **Strict Guardrails**: Default-deny network allowlist (`ALLOW_HOSTS`), human-confirmation gates, and audit trails.

---

## 🏗️ Architecture

```
[Tool Results] ──> TraceStore (Causal Trace & Error Classification)
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
 evolve_crystallize (Write)        evolve_gepa (Mutate)
            │                           │
            ▼                           ▼
 skills/evolve/<slug>/ (L3)   _gepa_queue/ (Variant Eval)
            │
            ▼
SkillMemory (.index.json) ──► before_agent_start (Read / Inject)
            │
            └──► SkillMemory.prune() (Adaptive Forgetting)
```

---

## 📦 Installation

```bash
# Global
pi install https://github.com/ArchdevilForge/pi-effect-evolve.git

# Or project-local
pi install -l https://github.com/ArchdevilForge/pi-effect-evolve.git

# Quick trial
pi -e ./dist/src/extension.js
```

### Configuration (`.env`)

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PI_EFFECT_ALLOW_HOSTS` | `""` | Comma-separated domain allowlist (e.g. `example.com,*.api.io`) |
| `PI_EFFECT_ALLOW_NETWORK` | `0` | Set `1` to enable networked tools (`web_real`, `web_scan_real`) |
| `PI_EFFECT_REQUIRE_CONFIRM` | `1` | Human confirmation prompt before saving crystallized skills |
| `PI_EFFECT_EVOLVE_MODE` | `conservative` | Evolution mode: `conservative` \| `auto` \| `gepa` |
| `PI_EFFECT_SKILL_MAX_KB` | `15` | Max allowable size in KB per crystallized skill |
| `PI_EFFECT_AUDIT_LOG` | `.pi/evolve-audit.jsonl` | Filepath for JSONL audit trail |

---

## 🛠️ Tools

| Tool | Purpose | Gate / Protection |
|---|---|---|
| `web_real` | Execute JS in persistent Chrome via `agent-browser` | Allowlist + Network Gate + Effect Retry |
| `web_scan_real` | Extract DOM & title from allowlisted targets | Allowlist + Network Gate |
| `evolve_crystallize` | Save reusable recipe to `skills/evolve/` | Confirmation + 15KB Gate + pytest |
| `evolve_search` | Search indexed skills with quality scoring | Read-only |
| `evolve_feedback` | Report skill execution success/failure | Drives adaptive pruning |
| `evolve_trace` | Inspect structured goal traces & errors | Read-only |
| `evolve_gepa` | Run offline diagnosis → mutation → selection | Gated by `EVOLVE_MODE=gepa` |

---

## 🚀 Quick Usage

### 1. Crystallize a Skill
```
User: "Observe https://example.com signing flow, extract the token logic, and crystallize."
```
1. `web_real` extracts logic within allowlist boundaries.
2. `bash` verifies replay offline.
3. `evolve_crystallize` asks confirmation → writes `skills/evolve/<slug>/` → updates `.index.json`.

### 2. Search & Feedback Loop
```bash
# Query existing skills
evolve_search --query "signing"

# Send outcome feedback (success/failure)
evolve_feedback --slug "example-sign" --success true
```

### 3. GEPA Self-Evolution
```bash
# In gepa mode:
set PI_EFFECT_EVOLVE_MODE=gepa && pi
evolve_gepa --autoApply false
```

---

## 🛡️ Safety & Guardrails

* **Zero-Leak Guarantee**: Never commits tokens, cookies, or real endpoints (`.env` and session paths are gitignored).
* **Deterministic Fallback**: Missing `agent-browser` bridges degrade gracefully with clear diagnostic errors.
* **Auditability**: Every network invocation and crystallization event writes to `.pi/evolve-audit.jsonl`.

---

## 📜 License

MIT © [ArchdevilForge](https://github.com/ArchdevilForge)
