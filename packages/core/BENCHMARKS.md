# @umpire/core Benchmarks

This file records the benchmark harness and initial observed timings for `@umpire/core`.

## Run

```bash
yarn workspace @umpire/core bench
```

The benchmark script lives at `packages/core/scripts/benchmark.mjs` and builds the package before running.

## Baseline

Observed on April 3, 2026 from a local development run.

These numbers come from repeated in-process runs, so they should be read as steady-state performance rather than cold-start latency. They are most useful as a regression baseline.

| Benchmark | Iterations | Avg ms | Ops/sec | Checksum |
| --- | ---: | ---: | ---: | ---: |
| `create/scheduler-60-sections` | 25 | 1.954 | 511.71 | 62400 |
| `check/scheduler/pro-plan` | 150 | 0.442 | 2263.04 | 117780 |
| `check/scheduler/basic-readonly` | 150 | 0.427 | 2340.05 | 147829 |
| `challenge/review-lock-chain` | 100 | 0.318 | 3148.46 | 606 |
| `play/plan-downgrade` | 100 | 0.688 | 1454.52 | 226543 |
| `graph/export-scheduler` | 100 | 0.308 | 3245.48 | 242400 |
| `check/minesweeper-expert-board` | 100 | 0.261 | 3836.33 | 48480 |

## Notes

- The scheduler workload is synthetic but intentionally mixes `oneOf`, `requires`, `disables`, `anyOf`, `check`, `challenge`, `play`, and `graph()` so the baseline covers the major code paths together.
- The Minesweeper workload mirrors the existing expert-board example at 480 cells and 1440 rules.
- In an ad hoc scaling check outside the committed harness, a roughly 10x larger Minesweeper-style board still scaled cleanly and stayed in single-digit milliseconds per `check()`, which suggests field count alone is not currently a worrying hot path.
