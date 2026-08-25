# Benchmark

This is the frozen expansion benchmark for the V1.1 implementation. It tests whether procedural memory improves `pi` on held-out tasks from the same task family after one training run.

The experiment artifacts are separated by commit:

- `ca9460f`: V1.1 implementation
- `880ac22`: benchmark catalog and paired-analysis harness
- `22c6cd7`: results from the complete expansion run

## What we test

The primary question is whether a Learned agent, given memory crystallized from a successful train task, performs better on related held-out tasks than the same agent running Bare without the extension.

## Experimental design

- 12 task families, 36 catalog tasks: one train task and two held-out tasks per family.
- 3 repeats per family.
- 36 train stages and 72 paired held-out task/repeat comparisons.
- 288 held-out Agent runs: 72 runs in each of four groups.
- Model: `muse-spark-1.2-contributor`, thinking level `high`.
- Seed: `20260824`.
- The train memory is reused for both held-out tasks in the same family/repeat.

| Group | Description | Pass rate | Median tokens | Median tools |
|---|---|---:|---:|---:|
| A Bare | Pi without the extension | 56/72 (77.8%) | 17,206 | 6.0 |
| B Empty | Extension with no memory | 61/72 (84.7%) | 21,188 | 6.0 |
| C Warm | Extension seeded with a gold verified skill; upper-bound control | 68/72 (94.4%) | 17,323 | 6.0 |
| D Learned | Extension with memory learned from the train task | 62/72 (86.1%) | 18,061 | 6.0 |

The primary comparison is D versus A. B and C are controls, not additional causal estimates.

## Primary result

Across the 72 paired held-out comparisons:

- D Learned passed 62 tasks; A Bare passed 56.
- D-only passes: 10.
- A-only passes: 4.
- Both passed: 52.
- Both failed: 6.
- Exact McNemar test: `p = 0.180`.

The result is directional evidence of improved task success, not statistically significant evidence at this sample size.

## Paired-success efficiency

Efficiency is computed only on the 52 pairs where both agents passed. This avoids treating an early failure or timeout as an efficiency win.

| Metric | A Bare median | D Learned median | Pair median delta |
|---|---:|---:|---:|
| Total tokens | 16,605 | 15,646 | -559 (-3.4%) |
| Tool calls | 6.0 | 5.5 | -1 (-16.7%) |
| Wall time | 12.4s | 10.7s | -0.7s (-5.9%) |

These are paired-success diagnostics, not a claim that Learned mode universally reduces cost. The direction varies by task family.

## Learning funnel

The funnel uses unique `family × repeat` train stages for training metrics and the 72 held-out runs for recall metrics.

| Stage | Result |
|---|---:|
| Train stages | 36 |
| Train solved | 29/36 (80.6%) |
| Successful train → crystallized | 29/29 (100%) |
| Held-out recalled | 58/72 (80.6%) |
| Useful recall | 53/72 (73.6%) |
| Useful given recall | 53/58 (91.4%) |

The harness recorded 30 crystallized candidates overall; one came from a train stage that did not pass, so successful-train crystallization is reported separately above.

Median train cost was 20,311 tokens, 6.5 tool calls, and 20.6 seconds. Using the reported median held-out savings of 176 tokens, the exploratory token break-even estimate is 116 reuses. Reuse value, not token savings, is the main follow-up metric.

## Task-class results

| Task class | Families | A pass | D pass | Both-pass pairs | Pair Δ tools | Pair Δ tokens |
|---|---:|---:|---:|---:|---:|---:|
| Transformation | 4 | 91.7% | 100.0% | 22 | -1.0 | -1,823 |
| Diagnostic | 4 | 45.8% | 58.3% | 7 | -5.0 | -68,862 |
| Repository modification | 3 | 94.4% | 100.0% | 17 | 0.0 | +911 |
| One-off reasoning | 1 | 100.0% | 100.0% | 6 | -0.5 | -6,823 |

The diagnostic efficiency row is especially unstable because it contains only seven both-pass pairs and several timeout-shaped outcomes. The broad result is that procedural memory has positive-looking behavior on transformation and some diagnostic workflows, while repository modification can carry context cost.

## Limitations

- One model and one thinking configuration.
- Small number of families and only three repeats.
- Agent behavior is stochastic.
- The pass-rate difference is not statistically significant (`p = 0.180`).
- Efficiency is task-dependent and is only compared on both-pass pairs.
- The gold-skill Warm group is an upper-bound control, not a deployable learning result.
- The benchmark does not establish long-term reuse value in real development.

## Reproduce

Run the frozen catalog with:

```bash
npm run benchmark:ab
```

The raw run and report are stored in `.benchmark-ab-results.json`.
