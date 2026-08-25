# pi-effect-evolve

> **Procedural memory and experience crystallization for `pi` coding agents.**

---

## ⚡ What It Actually Does

* 🧠 **Learn from successful workflows**: Captures useful execution traces after verified task completion.
* 💎 **Crystallize reusable skills**: Stores both executable code skills and multi-step procedure recipes.
* 🔎 **Recall on related tasks**: Retrieves relevant memory for future prompts and supports exact skill expansion when needed.
* ⚡ **Defer memory tooling**: Keeps evolve tool schemas out of unrelated provider requests to reduce context overhead.
* 🛡️ **Keep writes guarded**: Uses syntax verification, credential scrubbing, atomic replacement, and an audit trail.

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
| `evolve_get` | Load a matched skill by exact slug | Read-only |
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

# Measure extension, recipe, and deferred-tool schema tax
npm run benchmark:schema-tax

# Run the frozen 12-family expansion candidate (288 held-out + 36 train runs)
npm run benchmark:ab
```

The expansion benchmark keeps the task catalog fixed during a run. Primary evaluation is paired verifier outcome (`D Learned >= A Bare`) with an exact McNemar diagnostic. Efficiency is reported on the same-task/repeat pairs where both agents pass; results are also split by family and task class. Learning coverage uses unique `family × repeat` train stages, while recall and useful recall use held-out runs.

## 📊 Results

The frozen 12-family expansion run contains 72 paired held-out tasks. Learned mode passed 62/72 (86.1%) versus 56/72 (77.8%) for Bare Pi. The direction is positive, but the paired difference is not statistically significant at this sample size (exact McNemar `p = 0.180`).

Among the 52 pairs where both agents passed, Learned mode had slightly lower median total tokens (`-559`, `-3.4%`) and tool calls (`-1`, `-16.7%`). Efficiency remains task-dependent; this is not a claim of universal token savings.

See the full design, task-class breakdown, learning funnel, and limitations in [BENCHMARK.md](BENCHMARK.md).

---

## 🛡️ Practical Guardrails

* **AST Syntax Gate**: Mutated variants are verified via `python3 -c "import ast..."` or `node --check` prior to storage.
* **Basic Credential Scrubbing**: Strips common API token patterns (`sk-...`, `ghp_...`, `Bearer ...`) from saved scripts.
* **Atomic Disk Replacement**: Uses `.tmp -> rename` to eliminate torn writes during index updates.

---

## 📜 License

MIT © [ArchdevilForge](https://github.com/ArchdevilForge)
