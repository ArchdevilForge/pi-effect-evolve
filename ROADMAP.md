# Roadmap

Current status: `v0.1.0` release candidate, followed by real-world dogfooding. Core implementation and synthetic benchmark design are frozen.

## Next: dogfooding

Track only the signals that matter for long-term reuse:

- skills created
- skills recalled
- recall followed by verifier pass or fail
- `evolve_get` calls
- skills used at least 2 or 5 times
- negative transfer events

The next usage report should cover 7-day and 30-day retention rather than another synthetic task expansion.

## Deferred V2 directions

### Memory quality lifecycle

Add eventual promotion, decay, merge, and archive behavior for stale, duplicate, or conflicting skills.

### Negative-transfer detection

Distinguish useful, neutral, and harmful recalls, including recalls that lead to failure or unnecessary exploration.

### Skill abstraction

Generalize concrete task procedures into reusable strategies only after real usage shows which procedures are repeatedly valuable.

## Later validation

After dogfooding, run a small fixed subset on one or two additional models to test whether the positive direction is model-specific. Do not repeat the full 288-run matrix until that result justifies it.
