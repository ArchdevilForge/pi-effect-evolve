---
name: web-real
description: Real-browser web execution (GA TMWebdriver distilled). Use for signing-chain locate, page observe, runtime sampling, env replay with evidence. Pi analog of GA web_scan/web_execute_js via agent-browser-cli bridge.
---

# Web-Real — GA TMWebdriver for pi

**First principles:** `headless` fails `webdriver/cdp` fingerprints (56/56 GA passes). Real persistent Chrome with profile = login + extensions + GPU + anti-bot `0.9` score. Pi gets it via `agent-browser-cli` (rust cli extracted from `GenericAgent/TMWebDriver.py`).

## Tools

* `web_real --code "return document.cookie"` / `web_scan_real --url https://example.com`
* Underlying: `agent-browser --execute <js>` via local `ws://127.0.0.1:18765` + Chrome extension
* Fallback if `agent-browser` missing: `web_fetch` + `code_run` (degrades, warns)

## Grey gates

* **Default deny** — `PI_EFFECT_ALLOW_NETWORK!=1` → `tool_call` returns `{block:true, reason:"set ALLOW_NETWORK=1 and add host to ALLOW_HOSTS"}`
* **Allowlist** — host must be in `PI_EFFECT_ALLOW_HOSTS=example.com,api.example.com` or exact `*.example.com`
* **Audit** — every `web_real` appends `pi.appendEntry("web-real-audit", {url, host, ts})` to `evolve-audit.jsonl`

## Hook recipe (safe)

1. `web_scan_real` → capture DOM + network targets
2. `web_real` hook: `fetch`/`XHR` intercept, `localStorage` read — never exfiltrate, only `return` evidence `body_contains` nonce
3. `bash` local replay (`node`/`python`) — prove offline
4. `evolve_crystallize` (confirm) → `skills/web-real/<slug>/`

## When to mutate vs crystallize

For stable signing chain → `evolve_crystallize`. For flaky prompt/tool description → batch to `evolve_trace` for GEPA offline mutate.
