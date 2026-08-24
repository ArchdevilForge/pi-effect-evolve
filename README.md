# pi-effect-evolve

> **Zero-Touch autonomous memory & self-evolution runtime for `pi` — absorbing GenericAgent (skill crystallization) & Hermes (GEPA trace-mutation) in an Effect-managed harness.**

---

## ⚡ Key Features (Zero-Touch Autonomous)

* 🧠 **Zero-Touch Auto-Recall**: On prompt submission, automatically identifies intent and injects matching crystallized recipes into the system prompt.
* 💎 **Zero-Touch Auto-Crystallize**: On task completion, automatically identifies multi-step successful workflows, extracts executable scripts, and saves them to `skills/evolve/` with index metadata.
* 📊 **Implicit Quality Feedback**: Automatically scores and updates success/failure metrics based on turn outcome without manual reporting.
* 🔄 **Autonomous Auto-Healing (GEPA)**: Automatically detects failure patterns (timeouts, runtime exceptions), mutates the skill with defensive logic/retries, and hot-patches the skill.
* 🧹 **Adaptive Forgetting**: Auto-deprecates stale (>60d) or low-success (<30%) skills on session startup and archives them after 90 days.
* ⚡ **Effect IO Kernel**: Typed error channels, Schedule-based exponential backoff, Layer dependency injection, and signal-aware aborts.

---

## 🏗️ Architecture

```
                       [User Prompt]
                             │
                             ▼ (before_agent_start)
         ┌───────────────────────────────────────┐
         │ 1. Auto-Recall & Direct Code Injection│
         └───────────────────────────────────────┘
                             │
                             ▼ (Agent Execution)
         ┌───────────────────────────────────────┐
         │ 2. TraceStore (Causal & Error Tree)   │
         └───────────────────────────────────────┘
                             │
                             ▼ (agent_end)
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
[Implicit Feedback]   [Auto-Crystallize]      [Auto-Healing]
 (Score Updates)     (Save New Recipes)     (GEPA Self-Repair)
     │                       │                       │
     └───────────────────────┴───────────────────────┘
                             │
                             ▼
                    SkillMemory (.index.json)
                             │
                             ▼ (session_start)
                     [Adaptive Pruning]
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
| `PI_EFFECT_EVOLVE_MODE` | `auto` | Evolution mode: `auto` (zero-touch) \| `conservative` \| `gepa` |
| `PI_EFFECT_ALLOW_HOSTS` | `*` | Comma-separated domain allowlist (`*` = allow all) |
| `PI_EFFECT_ALLOW_NETWORK` | `1` | Network switch: `1` = enabled (default), `0` = disabled |
| `PI_EFFECT_REQUIRE_CONFIRM` | `0` | Confirmation prompt before writes (`0` in auto mode) |
| `PI_EFFECT_SKILL_MAX_KB` | `15` | Max allowable size in KB per crystallized skill |
| `PI_EFFECT_AUDIT_LOG` | `.pi/evolve-audit.jsonl` | Filepath for JSONL audit trail |

---

## 🛠️ Tools

| Tool | Purpose | Mode |
|---|---|---|
| `web_real` | Execute JS in persistent Chrome via `agent-browser` | Full network default |
| `web_scan_real` | Extract DOM & title from targets | Full network default |
| `evolve_trace` | Inspect structured goal traces & error taxonomy | Read-only |
| `evolve_search` | Query indexed skills with quality score | Read-only |
| `evolve_crystallize` | Manually write/override a skill recipe | Manual / Override |
| `evolve_feedback` | Manually report success/failure score | Manual / Override |
| `evolve_gepa` | Manually run offline diagnosis and mutation | Manual / Review |

---

## 🚀 Everyday Experience (Zero Manual Work)

1. **You ask `pi` to solve a problem**:
   > *"Observe https://example.com signing flow, extract the token logic, and test offline."*
2. **First Run (Exploration)**: `pi` uses tools to explore and solve the problem.
3. **Background Learning**: When the task finishes, `pi-effect-evolve` automatically crystallizes the code into `skills/evolve/auto-example-signing/`.
4. **Subsequent Runs (Zero-Shot Reuse)**: Whenever you ask similar questions, `pi-effect-evolve` auto-retrieves the script and injects it into the prompt, reducing exploration time and token cost by >80%.
5. **Self-Correction**: If the target website updates and fails, background GEPA diagnoses the failure and hot-patches the skill with retry/exception handling.

---

## 🛡️ Safety & Guardrails

* **Zero-Leak Guarantee**: Never commits tokens, cookies, or real endpoints (`.env` and sessions are gitignored).
* **Audit Trail**: Every background crystallization and healing event writes to `.pi/evolve-audit.jsonl`.
* **Deterministic Fallback**: Missing bridges degrade gracefully with clear diagnostic errors.

---

## 📜 License

MIT © [ArchdevilForge](https://github.com/ArchdevilForge)
