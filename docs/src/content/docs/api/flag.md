---
title: ump.flag()
description: Compare two snapshots and return reset recommendations for fields that just became disabled.
---

# `ump.flag()`

`flag()` is the cleanup companion to `check()`. It never mutates values. It only recommends what the consumer should clear or reset.

## Signature

```ts
type Snapshot<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  values: InputValues
  conditions?: C
}

ump.flag(
  before: Snapshot<F, C>,
  after: Snapshot<F, C>,
): ResetRecommendation<F>[]
```

## Return Shape

```ts
type ResetRecommendation<F extends Record<string, FieldDef>> = {
  field: keyof F & string
  reason: string
  suggestedValue: unknown
}
```

## When A Recommendation Appears

`flag()` only returns a recommendation when all three conditions are true:

1. The field was enabled in `before` and disabled in `after`.
2. The current value in `after` is still non-empty under that field’s `isEmpty` rules.
3. The current value differs from the suggested reset value.

Condition three matters for defaults. If a field is disabled while it already holds its default value, recommending that same value again would be a no-op.

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

Because snapshots include `conditions`, `flag()` works even when field values do not change.

```ts
signupUmp.flag(
  { values: formValues, conditions: { plan: 'business' } },
  { values: formValues, conditions: { plan: 'personal' } },
)
```

That is how plan switches, feature flags, or captcha expiration can still produce reset recommendations.

## Convergence

`flag()` has a useful convergence property: as the consumer applies the recommended resets, the next pass eventually returns `[]`.

That is true even for non-empty defaults because the method suppresses no-op recommendations when the field already equals its `suggestedValue`.

## Example

```ts
const penalties = signupUmp.flag(
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
