---
title: Testing
description: Invariant testing utilities for umpire rule configurations.
---

`@umpire/testing` exports `monkeyTest()` — a function that probes an umpire instance with exhaustive or randomly-sampled inputs and asserts that six structural invariants hold across all of them.

Use it in your test suite to catch rule bugs that static construction-time validation can't see: impure predicates, foul cycles, undeclared dependencies, and divergence between `check()` and `challenge()`.

## Install

```bash
npm install --save-dev @umpire/testing
```

## Quick Start

```ts
import { umpire, enabledWhen, requires } from '@umpire/core'
import { monkeyTest } from '@umpire/testing'

const ump = umpire({
  fields: { mode: {}, details: {}, submit: {} },
  rules: [
    enabledWhen('details', (v) => v.mode === 'advanced'),
    requires('submit', 'mode'),
  ],
})

const result = monkeyTest(ump)
expect(result.passed).toBe(true)
```

## What it checks

| Invariant | Description |
|-----------|-------------|
| `determinism` | `check(values)` returns identical results on two consecutive calls. Catches impure predicates. |
| `self-play` | `play(snapshot, snapshot)` always returns zero fouls. Flags rules that foul the current state against itself. |
| `foul-convergence` | Applying foul suggestions repeatedly reaches zero fouls within the iteration limit. Catches foul cycles. |
| `challenge-check-agreement` | `challenge(field)` and `check()` agree on `enabled` and `fair` for every field. |
| `disabled-field-immunity` | Mutating a disabled field's value does not change the availability of any field that doesn't declare it as a dependency. Catches undeclared rule sources. |
| `init-clean` | `play(init(), init())` returns zero fouls. The initial state must always be legal. |

## Input generation

The probe value set is `[null, undefined, '', 'a', 0, 1, true, false]` — universal enough to trigger most boolean-style conditions without knowing field types at runtime.

- **≤ 6 fields:** all combinations tested exhaustively (up to 8⁶ = 262,144 inputs).
- **> 6 fields:** `options.samples` random combinations generated using a seeded PRNG. Reproducible by default — seed `42` unless overridden.

## API

```ts
function monkeyTest(ump: Umpire<any, any>, options?: MonkeyTestOptions): MonkeyTestResult
```

### Options

```ts
type MonkeyTestOptions = {
  samples?: number                        // random sample count for large forms (default: 1000)
  seed?: number                           // PRNG seed for reproducibility (default: 42)
  conditions?: Record<string, unknown>[]  // condition snapshots to probe (default: [{}])
  maxFoulIterations?: number              // convergence limit (default: 10)
}
```

### Result

```ts
type MonkeyTestResult = {
  passed: boolean
  violations: MonkeyTestViolation[]
  samplesChecked: number
}

type MonkeyTestViolation = {
  invariant: 'determinism' | 'self-play' | 'foul-convergence' | 'challenge-check-agreement' | 'disabled-field-immunity' | 'init-clean'
  values: Record<string, unknown>
  conditions?: Record<string, unknown>
  description: string
}
```

At most 50 violations are collected before the run stops early, so the result stays readable even when a rule is broadly broken.

## Testing with conditions

If your umpire uses conditions, pass representative snapshots so they're included in each probe:

```ts
const result = monkeyTest(ump, {
  conditions: [
    { role: 'admin' },
    { role: 'viewer' },
  ],
})
```

Each conditions entry is tested against every sampled value combination.

## Example: catching a foul cycle

```ts
import { umpire, disables, enabledWhen } from '@umpire/core'
import { monkeyTest } from '@umpire/testing'

// Contrived cycle: a disables b, b disables a — play() can loop
const ump = umpire({
  fields: { a: { default: 'x' }, b: { default: 'y' } },
  rules: [
    enabledWhen('a', (v) => !v.b),
    enabledWhen('b', (v) => !v.a),
  ],
})

const result = monkeyTest(ump, { maxFoulIterations: 5 })

if (!result.passed) {
  console.log(result.violations)
  // [{ invariant: 'foul-convergence', ... }]
}
```

## See also

- [`umpire()` construction-time checks](/api/umpire/#structural-contradiction-detection) — what gets caught before runtime
- [DevTools](/extensions/devtools/) — visual inspection of scorecards and foul logs during development
