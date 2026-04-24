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

Takes the result of `ump.check(values)` and returns a fluent assertion chain. Each method accepts variadic field names and throws a plain `Error` listing every failing field if any assertion fails — no test runner integration needed.

```typescript
import { fairWhen, requires, umpire } from '@umpire/core'
import { checkAssert } from '@umpire/testing'

const ump = umpire({
  fields: {
    email: { required: true },
    password: { required: true },
    referralCode: {},
  },
  rules: [
    requires('referralCode', 'email'),
    fairWhen('password', (val) => String(val).length >= 8, {
      reason: 'Password must be at least 8 characters',
    }),
  ],
})

// No email — referralCode is disabled; short password is foul
checkAssert(ump.check({ password: 'abc' }))
  .disabled('referralCode')
  .foul('password')
  .unsatisfied('email')
  .required('email', 'password')
```

Methods: `.enabled()`, `.disabled()`, `.fair()`, `.foul()`, `.required()`, `.optional()`, `.satisfied()`, `.unsatisfied()`.

All methods return `this` for chaining. Disabled fields always have `fair: true` in umpire, so `.foul()` only fires for enabled fields with values that fail a fairness predicate.

For full documentation see the [Testing reference](https://umpire.dev/extensions/testing/#checkassertresult).

## `scorecardAssert(result)`

Takes the result of `ump.scorecard(snapshot, { before })` and returns a fluent assertion chain over the transition. Use it to verify what changed, what cascaded, and what earned a foul-reset recommendation.

```typescript
import { requires, umpire } from '@umpire/core'
import { scorecardAssert } from '@umpire/testing'

const ump = umpire({
  fields: {
    cardType: {},
    cardNumber: {},
    expiryDate: {},
    billingZip: {},
  },
  rules: [
    requires('cardNumber', 'cardType', { reason: 'Pick a card type first' }),
    requires('expiryDate', 'cardNumber', {
      reason: 'Enter a card number first',
    }),
  ],
})

// User clears cardType after the form was filled in
const result = ump.scorecard(
  {
    values: {
      cardType: null,
      cardNumber: '4111111111111111',
      expiryDate: '12/30',
      billingZip: '10001',
    },
  },
  {
    before: {
      values: {
        cardType: 'visa',
        cardNumber: '4111111111111111',
        expiryDate: '12/30',
        billingZip: '10001',
      },
    },
  },
)

scorecardAssert(result)
  .onlyChanged('cardType')
  .cascaded('cardNumber', 'expiryDate')
  .fouled('cardNumber', 'expiryDate')
  .notFouled('billingZip')
  .check()
  .disabled('cardNumber', 'expiryDate')
  .enabled('cardType', 'billingZip')
```

Methods: `.changed()`, `.notChanged()`, `.cascaded()`, `.fouled()`, `.notFouled()`, `.onlyChanged()`, `.onlyFouled()`, `.check()`.

`.check()` delegates to `checkAssert(result.check)` so you can make availability assertions on the same scorecard result without a separate `ump.check()` call.

For full documentation see the [Testing reference](https://umpire.dev/extensions/testing/#scorecardassertresult).

## `trackCoverage(ump)`

Wraps an umpire instance and instruments it so your scenario tests can report which field states and rule failures they actually exercised. The tracker answers: did any test see `referralCode` while disabled? Did the `fairWhen(password, ...)` rule ever fire?

Only calls through `tracker.ump` contribute to coverage — calling the original unwrapped umpire does not.

```typescript
import { fairWhen, requires, umpire } from '@umpire/core'
import { trackCoverage } from '@umpire/testing'

const ump = umpire({
  fields: {
    email: { required: true },
    password: { required: true },
    referralCode: {},
  },
  rules: [
    requires('referralCode', 'email'),
    fairWhen('password', (val) => String(val).length >= 8, {
      reason: 'Password must be at least 8 characters',
    }),
  ],
})

const tracker = trackCoverage(ump)

// Scenario 1: email present — referralCode unlocked, password valid
tracker.ump.check({
  email: 'user@example.com',
  password: 'hunter2!',
  referralCode: 'PROMO',
})

// Scenario 2: no email — referralCode disabled, password foul
tracker.ump.check({ email: null, password: 'abc' })

const { fieldStates, uncoveredRules } = tracker.report()

expect(fieldStates.referralCode.seenEnabled).toBe(true)
expect(fieldStates.referralCode.seenDisabled).toBe(true)
expect(fieldStates.password.seenFoul).toBe(true)
expect(uncoveredRules).toEqual([])
```

`report().fieldStates` records `seenEnabled`, `seenDisabled`, `seenFair`, `seenFoul`, `seenSatisfied`, and `seenUnsatisfied` for every field. `report().uncoveredRules` lists rules that never produced a failure in any instrumented call, using `challenge()` `ruleId` metadata to distinguish multiple same-type rules on the same target. Call `tracker.reset()` to clear observations between scenarios without rebuilding the wrapped umpire.

For full documentation see the [Testing reference](https://umpire.dev/extensions/testing/#trackcoverageump).
