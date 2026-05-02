---
title: disables()
description: Disable target fields when a source is active.
---

When the source is active, the targets are disabled. Unlike `requires()`, `disables()` only checks whether the source value is satisfied — it does not check the source's own availability.

## Signature

```ts
disables(
  source,
  ['targetA', 'targetB'],
  {
    reason?: string | ((values, conditions) => string)
  },
)
```

`source` can be:

- a field name
- a named field builder
- a predicate `(values, conditions) => boolean`
- a `check(field, validator)` helper

`targets` can be:

- field names
- named field builders

## Examples

```ts
// Field-name source — when dates has a value, pattern fields disable
disables('dates', ['everyWeekday', 'everyDate', 'everyMonth'])

// Predicate source — condition-driven disable
disables((_v, c) => c.promoActive, ['serviceLevel', 'vehicleType'], {
  reason: 'locked by active promotion',
})
```

## Default reason

- `"overridden by <fieldName>"` for a field-name source
- `"overridden by condition"` for a predicate source without preserved field metadata

## Important behavior

A disabled field with a lingering value still affects its dependents. `disables` checks source *values*, not source *availability*. This is intentional — a stale value in a disabled source still disables targets until the consumer clears it.

## See also

- [Quick Start: disables](/learn/#disables) — interactive demo
- [Availability vs Validation](/concepts/availability/#recommendations-not-mutations) — why stale values persist
