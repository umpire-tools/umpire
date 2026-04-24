---
title: Testing
description: Scenario assertions, coverage tracking, and structural invariant testing for umpire rule configurations.
---

`@umpire/testing` covers three layers of umpire test quality.

`checkAssert` and `scorecardAssert` add readable assertion chains to scenario tests — you write a specific input, then assert exactly which fields are enabled, disabled, foul, changed, or cascaded. `trackCoverage` instruments an umpire instance so your test suite can report which field states and rule failures it actually exercised. `monkeyTest` probes the instance independently with exhaustive or randomly-sampled inputs and checks that six structural invariants hold across all of them.

## Install

```bash
npm install --save-dev @umpire/testing
```

## checkAssert(result)

`checkAssert` takes the result of `ump.check(values)` and returns a fluent assertion chain for making readable field-level availability assertions in any test framework. When an assertion fails, it throws a plain `Error` listing every failing field — no test runner integration required.

### Signature

```ts
function checkAssert<K extends string>(
  result: Record<K, FieldStatus>,
): CheckAssertChain<K>
```

### Methods

Each method accepts one or more field names. All failing fields are collected before throwing, so you see the full picture at once rather than stopping at the first failure. Each method returns the chain so assertions can be composed inline.

| Method | Asserts |
|--------|---------|
| `.enabled(...fields)` | `status.enabled === true`. Error message includes the reason string if one is attached to the disabling rule. |
| `.disabled(...fields)` | `status.enabled === false` |
| `.fair(...fields)` | `status.fair === true`. Error message includes the reason string if the field is foul. Note: disabled fields always have `fair: true` in umpire, so `.fair()` passes for any disabled field. |
| `.foul(...fields)` | `status.fair === false`. Includes the current `enabled` state in the error so you can tell whether you hit a disabled field by mistake. |
| `.required(...fields)` | `status.required === true` |
| `.optional(...fields)` | `status.required === false` |
| `.satisfied(...fields)` | `status.satisfied === true` |
| `.unsatisfied(...fields)` | `status.satisfied === false` |

Passing an unknown field name throws immediately: `checkAssert: unknown field "fieldName"`.

### Error message format

Single-field failures produce a single-line message:

```
checkAssert: expected "guarded" to be enabled — was disabled (reason: "requires gate")
```

Multi-field failures list each one:

```
checkAssert: expected the following field(s) to be enabled:
  "cardNumber" — was disabled (reason: "Pick a card type first")
  "expiryDate" — was disabled (reason: "Enter a card number first")
```

### Example

```ts
import { fairWhen, requires, umpire } from '@umpire/core'
import { checkAssert } from '@umpire/testing'

const ump = umpire({
  fields: {
    email: { required: true },
    password: { required: true },
    referralCode: {},
    terms: { required: true },
  },
  rules: [
    requires('referralCode', 'email'),
    fairWhen('password', (val) => String(val).length >= 8, {
      reason: 'Password must be at least 8 characters',
    }),
  ],
})

// No email — referralCode should be disabled; password foul with short value
const result = ump.check({ password: 'short' })

checkAssert(result)
  .disabled('referralCode')
  .foul('password')
  .unsatisfied('email', 'terms')
  .required('email', 'password', 'terms')
```

### In your test suite

`checkAssert` throws a plain `Error`, so any framework that supports `expect(() => ...).not.toThrow()` works without configuration:

```ts
it('referralCode is disabled without an email', () => {
  expect(() =>
    checkAssert(ump.check({ password: 'short' }))
      .disabled('referralCode')
      .foul('password')
  ).not.toThrow()
})
```

## scorecardAssert(result)

`scorecardAssert` takes the result of `ump.scorecard(snapshot, { before })` and returns a fluent assertion chain for transition assertions. It answers questions about what changed, what cascaded, and what now needs a foul reset — all on a single scorecard result.

### Signature

```ts
function scorecardAssert<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(result: ScorecardResult<F, C>): ScorecardAssertChain<keyof F & string>
```

### Methods

| Method | Asserts |
|--------|---------|
| `.changed(...fields)` | `result.fields[f].changed === true` |
| `.notChanged(...fields)` | `result.fields[f].changed === false` |
| `.cascaded(...fields)` | `result.fields[f].cascaded === true` |
| `.fouled(...fields)` | `result.fields[f].foul !== null` — the field has a foul-reset recommendation |
| `.notFouled(...fields)` | `result.fields[f].foul === null`. Error includes the foul reason if one is present. |
| `.onlyChanged(...fields)` | `result.transition.changedFields` is exactly this set, order-independent. Throws if any field is missing from the expected set or appears unexpectedly. |
| `.onlyFouled(...fields)` | `result.transition.fouledFields` is exactly this set, order-independent. |
| `.check()` | Returns a `CheckAssertChain` over `result.check` — the full availability snapshot from the same scorecard call. |

Passing an unknown field name throws immediately: `scorecardAssert: unknown field "fieldName"`.

### Checking availability through `.check()`

`.check()` delegates to `checkAssert(result.check)`, so you can assert availability within the same chain without calling `ump.check()` separately:

```ts
scorecardAssert(result)
  .changed('cardType')
  .cascaded('cardNumber', 'expiryDate')
  .check()
    .disabled('cardNumber', 'expiryDate')
    .enabled('billingZip')
```

### Example

The payment form domain used in the test suite makes this concrete: clearing `cardType` disables `cardNumber` and cascades a foul reset to `expiryDate`.

```ts
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
    requires('expiryDate', 'cardNumber', { reason: 'Enter a card number first' }),
  ],
})

// User clears cardType after having filled in the whole form
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

### In your test suite

Same pattern as `checkAssert` — wrap the chain in `expect(() => ...).not.toThrow()`:

```ts
it('clearing cardType cascades fouls downstream', () => {
  expect(() =>
    scorecardAssert(ump.scorecard(after, { before }))
      .onlyChanged('cardType')
      .cascaded('cardNumber', 'expiryDate')
      .fouled('cardNumber', 'expiryDate')
  ).not.toThrow()
})
```

## trackCoverage(ump)

`trackCoverage` wraps an umpire instance and instruments it so your scenario tests can report which field states and rule failures they actually exercised. The goal is to answer: did your test suite visit `cardNumber` while disabled? Did any test trigger the `requires(expiryDate, cardNumber)` rule?

Without this, a passing test suite can silently miss entire branches of your rule graph.

### Signature

```ts
function trackCoverage<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(ump: Umpire<F, C>): CoverageTracker<F, C>
```

### Return shape

```ts
type CoverageTracker<F, C> = {
  ump: Umpire<F, C>       // instrumented proxy — use this in your tests
  report(): CoverageReport<keyof F & string>
  reset(): void
}

type CoverageReport<K extends string> = {
  fieldStates: Record<K, FieldStateCoverage>
  uncoveredRules: RuleCoverage[]
}

type FieldStateCoverage = {
  seenEnabled: boolean
  seenDisabled: boolean
  seenFair: boolean
  seenFoul: boolean
  seenSatisfied: boolean
  seenUnsatisfied: boolean
}

type RuleCoverage = {
  index: number
  id: string
  description: string
}
```

### How it works

`tracker.ump` is a full `Umpire` proxy — it supports every method on the original, but `check()` and `scorecard()` also record observations. Only calls through `tracker.ump` contribute to coverage; calling the original unwrapped umpire does not.

`report().fieldStates` accumulates across all instrumented calls. Each field starts with all six boolean flags set to `false`, and they flip to `true` as those states appear in results.

`report().uncoveredRules` lists rules from `ump.rules()` that never produced a failure in any instrumented call. Rule coverage is determined by inspecting `challenge()` `ruleId` metadata — each rule instance gets a unique ID, so two `requires()` rules targeting the same field are tracked independently. The normalized `index` is included for cross-referencing with the rule list.

Rule descriptions are generated from inspection metadata:

| Rule type | Description format |
|-----------|-------------------|
| `requires(target, dep1, dep2)` | `"requires(target, dep1, dep2)"` |
| `disables(source, target1)` | `"disables(source, target1)"` |
| `fairWhen(target, ...)` | `"fairWhen(target, ...)"` |
| `enabledWhen(target, ...)` | `"enabledWhen(target, ...)"` |
| `oneOf(groupName)` | `"oneOf(groupName)"` |
| `anyOf(N rules)` | `"anyOf(N rules)"` |
| `eitherOf(groupName)` | `"eitherOf(groupName)"` |
| Custom/opaque rules | `"uninspectable rule #N"` |

### `reset()`

`reset()` clears all field-state observations and covered rule IDs without rebuilding the wrapped umpire. Use it to isolate coverage between distinct scenarios in the same test suite run.

```ts
tracker.ump.check({ mode: 'guest' })
const guestReport = tracker.report()

tracker.reset()

tracker.ump.check({ mode: 'admin' })
const adminReport = tracker.report()
```

### Example

```ts
import { fairWhen, requires, umpire } from '@umpire/core'
import { trackCoverage } from '@umpire/testing'

const ump = umpire({
  fields: {
    email: { required: true },
    password: { required: true },
    referralCode: {},
    terms: { required: true },
  },
  rules: [
    requires('referralCode', 'email'),
    fairWhen('password', (val) => String(val).length >= 8, {
      reason: 'Password must be at least 8 characters',
    }),
  ],
})

const tracker = trackCoverage(ump)

// Scenario 1: email present, referralCode unlocked, valid password
tracker.ump.check({
  email: 'user@example.com',
  password: 'hunter2!',
  referralCode: 'PROMO',
  terms: true,
})

// Scenario 2: no email, referralCode disabled, short password
tracker.ump.check({
  email: null,
  password: 'abc',
})

const { fieldStates, uncoveredRules } = tracker.report()

// referralCode was seen both enabled and disabled
console.log(fieldStates.referralCode.seenEnabled)   // true
console.log(fieldStates.referralCode.seenDisabled)  // true

// password fairWhen rule was triggered by the short password
console.log(uncoveredRules) // []
```

If any entry appears in `uncoveredRules`, you have a rule that no test scenario has exercised as a failure. That rule could be broken and your tests would not catch it.

## monkeyTest(ump, options?)

`monkeyTest` probes an umpire instance with exhaustive or randomly-sampled inputs and checks that six structural invariants hold across all of them. Use it in your test suite to catch rule bugs that static construction-time validation can't see: impure predicates, foul cycles, undeclared dependencies, and divergence between `check()` and `challenge()`.

### What it checks

| Invariant | Description |
|-----------|-------------|
| `determinism` | `check(values)` returns identical results on two consecutive calls. Catches impure predicates. |
| `self-play` | `play(snapshot, snapshot)` always returns zero fouls. Flags rules that foul the current state against itself. |
| `foul-convergence` | Applying foul suggestions repeatedly reaches zero fouls within the iteration limit. Catches foul cycles. |
| `challenge-check-agreement` | `challenge(field)` and `check()` agree on `enabled` and `fair` for every field. |
| `disabled-field-immunity` | Mutating a disabled field's value does not change the availability of any field that doesn't declare it as a dependency. Catches undeclared rule sources. |
| `init-clean` | `play(init(), init())` returns zero fouls. The initial state must always be legal. |

### Input generation

The probe value set is `[null, undefined, '', 'a', 0, 1, true, false]` — universal enough to trigger most boolean-style conditions without knowing field types at runtime.

- **≤ 6 fields:** all combinations tested exhaustively (up to 8⁶ = 262,144 inputs).
- **> 6 fields:** `options.samples` random combinations generated using a seeded PRNG. Reproducible by default — seed `42` unless overridden.

### API

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

### Testing with conditions

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

### Example: catching a foul cycle

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

### Complementing trackCoverage

`trackCoverage` and `monkeyTest` answer different questions and are worth running together.

`trackCoverage` tells you which states your named scenarios exercised — it's coverage in the sense of deliberate test design. If `uncoveredRules` is non-empty, a rule went untested by any scenario you wrote.

`monkeyTest` doesn't know about your scenarios. It probes the rule graph directly across inputs no human would enumerate, looking for structural failures. A rule could be covered by `trackCoverage` and still fail `monkeyTest` — if, for example, the predicate that implements it is impure or produces foul cycles on certain value combinations.

```ts
import { umpire, fairWhen, requires } from '@umpire/core'
import { trackCoverage, monkeyTest } from '@umpire/testing'

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

// Scenario tests run through the tracker
tracker.ump.check({ email: 'user@example.com', password: 'hunter2!', referralCode: 'PROMO' })
tracker.ump.check({ email: null, password: 'abc' })

// Every rule failure was exercised by at least one scenario
expect(tracker.report().uncoveredRules).toEqual([])

// Structural invariants hold across all sampled inputs
expect(monkeyTest(ump).passed).toBe(true)
```

## See also

- [`umpire()` construction-time checks](/api/umpire/#structural-contradiction-detection) — what gets caught before runtime
- [scorecard()](/api/scorecard/) — the transition API that `scorecardAssert` wraps
- [DevTools](/extensions/devtools/) — visual inspection of scorecards and foul logs during development
