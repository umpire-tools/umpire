---
title: ump.play()
description: Compare two snapshots and return reset recommendations for fields that just fell out of play.
---

`play()` is the cleanup companion to `check()`. It never mutates values. It only recommends what the consumer should clear or reset.

## Signature

```ts
type Snapshot<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  values: InputValues
  conditions?: C
}

ump.play(
  before: Snapshot<F, C>,
  after: Snapshot<F, C>,
): Foul<F>[]
```

## Return Shape

```ts
type Foul<F extends Record<string, FieldDef>> = {
  field: keyof F & string
  reason: string
  suggestedValue: unknown
}
```

## When A Recommendation Appears

`play()` produces a foul when a field holds a non-empty value that just fell out of play. There are two ways that can happen:

**Availability foul** — the field was enabled in `before` and is disabled in `after`.

**Appropriateness foul** — the field is still enabled, but a `fairWhen` predicate that was passing in `before` is now failing in `after`. The value is present and the field is available, but the selection is no longer appropriate given the current form state.

In both cases, a recommendation only appears when:

1. The trigger above applies.
2. The current value in `after` is still non-empty under that field’s `isEmpty` rules.
3. The current value differs from the suggested reset value.

Condition three matters for defaults. If a field falls out of play while it already holds its default value, recommending that same value again would be a no-op.

## `suggestedValue`

`suggestedValue` is:

- `FieldDef.default` when the field defines one
- `undefined` otherwise

```ts
const ump = umpire({
  fields: {
    isAllDay: { default: true },
    startTime: { default: '09:00' },
    endTime: {},
  },
  rules: [],
})
```

Disabling `startTime` recommends `'09:00'`. Disabling `endTime` recommends `undefined`.

## Conditions-Only Transitions

Because snapshots include `conditions`, `play()` works even when field values do not change.

```ts
signupUmp.play(
  { values: formValues, conditions: { plan: 'business' } },
  { values: formValues, conditions: { plan: 'personal' } },
)
```

That is how plan switches, feature flags, or captcha expiration can still produce reset recommendations.

## Convergence

`play()` has a useful convergence property: as the consumer applies the recommended resets, the next pass eventually returns `[]`.

That is true even for non-empty defaults because the method suppresses no-op recommendations when the field already equals its `suggestedValue`.

## Example

```ts
const fouls = signupUmp.play(
  {
    values: {
      companyName: 'Acme',
      companySize: '50',
    },
    conditions: { plan: 'business' },
  },
  {
    values: {
      companyName: 'Acme',
      companySize: '50',
    },
    conditions: { plan: 'personal' },
  },
)

// [
//   {
//     field: 'companyName',
//     reason: 'business plan required',
//     suggestedValue: undefined,
//   },
//   {
//     field: 'companySize',
//     reason: 'business plan required',
//     suggestedValue: undefined,
//   },
// ]
```

## When `check()` is enough

Think about what question you're actually trying to answer.

In a scheduler, a user picks a date, a time, a recurrence pattern, and a timezone. When they submit, you need to know which fields are active and which of those still lack a value. That is a question about the current state of the form — and `check()` answers it directly:

```ts
const availability = scheduleUmp.check(values, conditions)

for (const [field, status] of Object.entries(availability)) {
  if (!status.enabled) continue
  if (!status.satisfied) errors.push(`${field} is required`)
}
```

You don't need two snapshots for this. You don't need to know what changed. You need to know what's true right now.

`play()` answers a different question: *something changed — do any fields need to be cleared?* The prototype for that is a recurrence toggle. The user sets a recurrence pattern, then switches the event to "all day." The time fields fall out of play, but they still hold values. `play()` notices that, tells you which fields are affected, and suggests what to reset them to.

If your handler doesn't need to auto-reset anything — it just validates and saves — reach for `check()` and stop there. `play()` earns its keep when a state transition leaves stale values behind that you want to clean up before the user notices.

## `foulMap()` — lookup by field

`play()` returns an array, which is convenient for rendering a banner but requires `.find()` when you need the foul for a specific field. `foulMap()` converts the array into a field-keyed map:

```ts
import { foulMap } from '@umpire/core'

const fouls = ump.play(before, after)
const byField = foulMap(fouls)

byField.companyName?.reason   // 'business plan required'
byField.referralCode          // undefined — no foul for this field
```

Both representations are useful: the array for iterating (fouls banner, reset-all button), the map for per-field access (inline foul indicators, field-level reset buttons).

## Reactive `foul()` in signals

The `@umpire/signals` adapter exposes `reactive.foul(name)` for per-field foul access with fine-grained reactivity:

```ts
const reactive = reactiveUmp(ump, adapter)

// Per-field — only re-renders when this field's foul changes
const foul = reactive.foul('companyName')
// → Foul | undefined

// Full array — for banner rendering
const allFouls = reactive.fouls
```

`reactive.foul(name)` mirrors `reactive.field(name)` — availability and fouls have the same per-field accessor pattern.
