# @umpire/testing

Invariant testing utilities for umpire rule configurations.

## Install

```bash
npm install --save-dev @umpire/testing @umpire/core
```

## `monkeyTest(ump, options?)`

Probes an umpire instance with exhaustive or randomly-sampled inputs and checks that six structural invariants hold across all of them. Call this in your test suite to catch rule bugs that static validation can't see.

```typescript
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

### What it checks

| Invariant                   | Description                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `determinism`               | `check(values)` returns identical results on two consecutive calls. Catches impure predicates.                                                            |
| `self-play`                 | `play(snapshot, snapshot)` always returns zero fouls. Flags rules that foul the current state against itself.                                             |
| `foul-convergence`          | Applying foul suggestions repeatedly reaches zero fouls within the iteration limit. Catches foul cycles.                                                  |
| `challenge-check-agreement` | `challenge(field)` and `check()` agree on `enabled` and `fair` for every field.                                                                           |
| `disabled-field-immunity`   | Mutating a disabled field's value does not change the availability of any field that doesn't declare it as a dependency. Catches undeclared rule sources. |
| `init-clean`                | `play(init(), init())` returns zero fouls. The initial state must always be legal.                                                                        |

### Input generation

The probe value set is `[null, undefined, '', 'a', 0, 1, true, false]`.

- **≤ 6 fields:** all combinations are tested exhaustively (up to 8⁶ = 262,144 inputs).
- **> 6 fields:** `options.samples` random combinations are generated using a seeded PRNG (mulberry32). Reproducible by default — seed `42` unless overridden.

### Options

```typescript
type MonkeyTestOptions = {
  samples?: number // random sample count for large forms (default: 1000)
  seed?: number // PRNG seed (default: 42)
  conditions?: Record<string, unknown>[] // condition snapshots to probe (default: [{}])
  maxFoulIterations?: number // convergence limit (default: 10)
}
```

### Result

```typescript
type MonkeyTestResult = {
  passed: boolean
  violations: MonkeyTestViolation[]
  samplesChecked: number
}

type MonkeyTestViolation = {
  invariant:
    | 'determinism'
    | 'self-play'
    | 'foul-convergence'
    | 'challenge-check-agreement'
    | 'disabled-field-immunity'
    | 'init-clean'
  values: Record<string, unknown>
  conditions?: Record<string, unknown>
  description: string
}
```

At most 50 violations are collected before the run stops early.

### Testing with conditions

If your umpire uses conditions, pass representative snapshots so they're included in the probe:

```typescript
monkeyTest(ump, {
  conditions: [{ role: 'admin' }, { role: 'viewer' }],
})
```

Each conditions entry is tested against every sampled value combination.

## `checkAssert(result)`

Readable scenario assertions over `ump.check(values)` results.

```typescript
import { checkAssert } from '@umpire/testing'

checkAssert(ump.check({ gate: 'open' }))
  .enabled('gate')
  .optional('gate')
```

Methods: `.enabled()`, `.disabled()`, `.fair()`, `.foul()`, `.required()`, `.optional()`, `.satisfied()`, `.unsatisfied()`.

## `scorecardAssert(result)`

Readable transition assertions over `ump.scorecard(snapshot, { before })` results.

```typescript
import { scorecardAssert } from '@umpire/testing'

scorecardAssert(ump.scorecard(after, { before }))
  .changed('cardType')
  .cascaded('cardNumber', 'expiryDate')
  .fouled('cardNumber', 'expiryDate')
  .check()
  .disabled('cardNumber', 'expiryDate')
```

Methods: `.changed()`, `.notChanged()`, `.cascaded()`, `.fouled()`, `.notFouled()`, `.onlyChanged()`, `.onlyFouled()`, `.check()`.

## `trackCoverage(ump)`

Instruments an umpire instance so scenario tests can report which field states
and rule failures they exercised. Only calls made through `tracker.ump.check()`
and `tracker.ump.scorecard()` contribute to coverage.

```typescript
import { trackCoverage } from '@umpire/testing'

const tracker = trackCoverage(ump)

tracker.ump.check({ cardType: 'visa', cardNumber: '4111' })
tracker.ump.scorecard(after, { before })

expect(tracker.report().fieldStates.cardNumber.seenEnabled).toBe(true)
expect(tracker.report().uncoveredRules).toEqual([])
```

`report().fieldStates` records `seenEnabled`, `seenDisabled`, `seenFair`,
`seenFoul`, `seenSatisfied`, and `seenUnsatisfied` for every field. The
`uncoveredRules` list is based on `ump.rules()` and `challenge()` `ruleId`
metadata from `@umpire/core`, so it can distinguish multiple same-type rules on
the same target while still exposing the normalized rule `index`. Use
`tracker.reset()` to clear observations between scenarios.
