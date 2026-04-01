---
title: Topological Evaluation Order
description: Umpire builds a structural graph once, sorts it topologically, and evaluates fields in dependency order.
---

`ump.check()` computes the whole availability map in one pass. The order of that pass is fixed when you create the umpire.

## How The Structural Graph Is Built

At creation time, `umpire()` inspects every rule and builds a graph over field names.

Structural edges come from:

- `requires('A', 'B')` as `B -> A`
- `disables('B', ['A', 'C'])` as `B -> A` and `B -> C`
- `check('B', validator)` when used inside `requires()` or `disables()`, preserving `B` as the structural source
- `oneOf()` by linking fields in competing branches for graph export and branch introspection

Predicate-only rules like `enabledWhen('field', predicate)` do not add ordering edges because their dependencies are opaque to the graph.

When `enabledWhen()` uses `check('field', validator)`, Umpire can preserve that field relationship for graph export and creation-time validation, but it still stays non-ordering.

## Why Topological Order Matters

Field-name dependencies in `requires()` need final availability for upstream fields.

If `requires('repeatEvery', 'startTime')` and `startTime` was disabled by some earlier rule, `repeatEvery` must see that resolved disabled state. Topological order guarantees it.

That means declaration order does not control dependency correctness. Upstream fields are always evaluated before downstream fields, even if the rules appear later in the array.

## What Predicates See

Predicates receive the current `values` snapshot and optional `conditions`. They do not receive availability.

```ts
enabledWhen('colorLabel', (_values, conditions) => !!conditions.palette)
requires('submit', (values) => typeof values.password === 'string' && values.password.length > 0)
```

This is an intentional boundary:

- Field-name dependencies in `requires()` are availability-aware.
- Predicate-based rules are value-aware only.

If you want availability propagation, reference a field name directly.

## Declaration Order Still Matters

Within a single field, Umpire evaluates every targeting rule in declaration order.

That affects:

- `reason`, which is the first failing rule
- `reasons`, which aggregates every failing rule in order

```ts
enabledWhen('submit', check('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/), {
  reason: 'Enter a valid email address',
}),
enabledWhen('submit', ({ password }) => !!password, {
  reason: 'Enter a password',
}),
```

If both fail, `reason` is `"Enter a valid email address"` because that rule was declared first.

## Creation-Time Work

`umpire()` does the heavy structural work up front:

1. Validate referenced fields.
2. Build the structural graph.
3. Detect cycles in ordering edges.
4. Compute the topological order once.

After that, `check()`, `flag()`, and `challenge()` reuse the precomputed structure on every call.
