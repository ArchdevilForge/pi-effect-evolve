# pi-effect-evolve

> **A lightweight Procedural Memory & Experience Crystallization layer for `pi` — caching verified scripts, indexing reusable workflows, and transferring learned execution patterns across tasks in an Effect-managed harness.**

---

## ⚡ What It Actually Does

* 🧠 **Skill Cache & Auto-Recall**: On prompt submission, uses a sub-millisecond in-memory BM25/IDF inverted index to find previously verified scripts and injects Top-2 snippets into the system prompt.
* 💎 **Candidate Crystallization**: When a multi-step task succeeds, extracts candidate executable scripts from tool traces and persists them to `skills/evolve/<slug>/` with metadata.
* 🛡️ **Syntax-Verified Mutation**: When a skill encounters runtime/timeout failures, diagnoses the error category and generates defensive wrapper variants (retries/assertions/exceptions) that must pass AST syntax verification before application.
* 🧹 **Two-Stage Adaptive Pruning**: Automatically soft-deprecates inactive (>60d) or low-success (<30%) skills on session startup and archives them after 90 days.
* ⚡ **Effect IO Kernel**: Typed error channels, schedule-based backoff, atomic file replacement, and signal-aware aborts.

---

## 🏗️ Architecture

```
                       [User Prompt]
                             │
                             ▼ (before_agent_start)
         ┌───────────────────────────────────────┐
         │ 1. Sub-ms Inverted Index BM25 Recall  │
         │    (Inject Top-2 Reusable Snippets)   │
         └───────────────────────────────────────┘
                             │
                             ▼ (Agent Execution)
         ┌───────────────────────────────────────┐
         │ 2. TraceStore (Causal & Error Logger) │
         └───────────────────────────────────────┘
                             │
                             ▼ (agent_end)
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
[Error Logging]       [Crystallize]           [Syntax-Verified Patch]
 (Update Usage)     (Extract Script)          (AST-Gated Mutation)
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
```

### Configuration (`.env`)

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PI_EFFECT_EVOLVE_MODE` | `conservative` | Mode: `conservative` (prompt confirm on heal) \| `auto` (zero-touch) |
| `PI_EFFECT_ALLOW_HOSTS` | `*` | Comma-separated domain allowlist (`*` = allow all) |
| `PI_EFFECT_ALLOW_NETWORK` | `1` | Network switch: `1` = enabled, `0` = disabled |
| `PI_EFFECT_REQUIRE_CONFIRM` | `1` | Confirmation prompt before mutation writes |
| `PI_EFFECT_SKILL_MAX_KB` | `15` | Max allowable size in KB per crystallized skill |
| `PI_EFFECT_AUDIT_LOG` | `.pi/evolve-audit.jsonl` | Filepath for JSONL audit trail |

---

## 🛠️ Tools

| Tool | Purpose | Mode |
|---|---|---|
| `evolve_trace` | Inspect structured goal traces & error taxonomy | Read-only |
| `evolve_search` | Query indexed skills with quality score | Read-only |
| `evolve_crystallize` | Manually write/override a skill recipe | Manual / Override |
| `evolve_feedback` | Manually report success/failure score | Manual / Override |
| `evolve_gepa` | Manually run offline diagnosis and mutation | Manual / Review |
| `web_real` | Execute JS in persistent Chrome via `agent-browser` | Full network default |
| `web_scan_real` | Extract DOM & title from targets | Full network default |

---

## 🔬 Test & Microbenchmarks

```bash
# Run all 44 unit and regression tests
npm test

# Run 100-skill retrieval regression suite
npm run deep-benchmark

# Run 5,000-skill synthetic microbenchmark & concurrency stress test
npm run extreme-benchmark
```

---

## 🛡️ Practical Guardrails

* **AST Syntax Gate**: Mutated variants are verified via `python3 -c "import ast..."` or `node --check` prior to storage.
* **Basic Credential Scrubbing**: Strips common API token patterns (`sk-...`, `ghp_...`, `Bearer ...`) from saved scripts.
* **Atomic Disk Replacement**: Uses `.tmp -> rename` to eliminate torn writes during index updates.

---

## 📜 License

MIT © [ArchdevilForge](https://github.com/ArchdevilForge)
