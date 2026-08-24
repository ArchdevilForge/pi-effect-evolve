---
name: example-sign
description: De-sensitized demo — observe example.com signing chain via web_real, local replay, then crystallize. No real target, no secret.
---

# example-sign (demo)

1. `web_scan_real --url https://example.com` (allowlisted)
2. `web_real --code "return localStorage.getItem('demo_token')"` (hook XHR/fetch if needed)
3. local `node replay.js` verifies nonce-bound `body_contains`
4. `evolve_crystallize --slug example-sign --code "$(cat script.py)"` (confirm → writes `skills/evolve/example-sign/`)

All hosts are `example.com` — replace with your `ALLOW_HOSTS` allowlist.
