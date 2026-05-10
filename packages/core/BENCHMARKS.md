# @umpire/core Benchmarks

This file records the benchmark harness and initial observed timings for `@umpire/core`.

## Run

```bash
yarn workspace @umpire/core bench
```

The benchmark script lives at `packages/core/scripts/benchmark.mjs` and builds the package before running.

The normal benchmark output is timing-only by default so the common benchmark
path does not force GC inside the measured flow. To include lightweight retained
JavaScript heap deltas in the normal table, run:

```bash
BENCH_MEMORY=1 yarn workspace @umpire/core bench
```

When `BENCH_MEMORY=1` is set, each measured run forces a synchronous Bun GC
before and after the timed loop, then reports average retained `heapSize` and
object-count deltas from `bun:jsc` `heapStats()`. These columns are a progress
signal, not a precise allocation counter; short-lived allocation churn can still
be hidden by GC.

For investigation mode, run:

```bash
yarn workspace @umpire/core bench:memory
yarn workspace @umpire/core bench:leak
yarn workspace @umpire/core bench:profile
```

`bench:memory` enables memory collection, measures each scenario in isolated Bun
child processes, and summarizes median and p95 heap/object deltas. Use it when
normal benchmark timing regresses or allocation behavior looks suspicious.
`bench:leak` enables memory collection, repeatedly runs the `check()` and
`play()` hot-path scenarios in batches, forces GC between batches, and reports
retained heap/object trends from the same compiled engines. Use it to
distinguish stable long-lived fixture memory from leak-shaped per-call retained
growth. By default it warms each scenario for 100 calls, then measures 20
batches of 1000 calls over a prebuilt ring of 16 input objects. Set
`BENCH_LEAK_ROTATE_INPUTS=0` to reuse one fixed input per scenario, or
`BENCH_LEAK_INPUTS=<n>` to change the ring size. Leak-specific `BENCH_LEAK_*`
environment variables are ignored, with a warning, unless `BENCH_LEAK=1` is
also set.
`bench:profile` enables Bun's markdown heap profiler, writes a heap snapshot
under `packages/core/benchmark-profiles/`, and prints mimalloc native heap stats
on exit. Use it when a scenario needs deeper allocation attribution.

## Baseline

Observed on April 3, 2026 from a local development run.

These numbers come from repeated in-process runs, so they should be read as steady-state performance rather than cold-start latency. They are most useful as a regression baseline.

| Benchmark                        | Iterations | Avg ms | Ops/sec | Checksum |
| -------------------------------- | ---------: | -----: | ------: | -------: |
| `create/scheduler-60-sections`   |         25 |  1.954 |  511.71 |    62400 |
| `check/scheduler/pro-plan`       |        150 |  0.442 | 2263.04 |   117780 |
| `check/scheduler/basic-readonly` |        150 |  0.427 | 2340.05 |   147829 |
| `challenge/review-lock-chain`    |        100 |  0.318 | 3148.46 |      606 |
| `play/plan-downgrade`            |        100 |  0.688 | 1454.52 |   226543 |
| `graph/export-scheduler`         |        100 |  0.308 | 3245.48 |   242400 |
| `check/minesweeper-expert-board` |        100 |  0.261 | 3836.33 |    48480 |

## Notes

- The scheduler workload is synthetic but intentionally mixes `oneOf`, `requires`, `disables`, `anyOf`, `check`, `challenge`, `play`, and `graph()` so the baseline covers the major code paths together.
- The Minesweeper workload mirrors the existing expert-board example at 480 cells and 1440 rules.
- In an ad hoc scaling check outside the committed harness, a roughly 10x larger Minesweeper-style board still scaled cleanly and stayed in single-digit milliseconds per `check()`, which suggests field count alone is not currently a worrying hot path.
