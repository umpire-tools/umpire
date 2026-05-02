---
title: requires()
description: Keep a field disabled until its dependencies are satisfied and available.
---

A field stays disabled until all its dependencies are both satisfied (have a value) and available (enabled by their own rules). This is the rule for stepwise flows — `confirmPassword` requires `password`, `companySize` requires `companyName`.

## Signature

```ts
requires(
  field,
  ...deps,
)
```

Dependencies can be:

- field names
- named field builders
- predicates `(values, conditions) => boolean`
- `check(field, validator)` helpers

An optional final object is treated as rule options:

```ts
requires('submit', 'password', {
  reason: 'Password required before submit',
})
```

## Important behavior

- **Field-name dependencies** check both value satisfaction and dependency availability. If `startTime` is disabled by another rule, `repeatEvery` stays disabled too.
- **Predicate dependencies** only check the predicate result — no availability awareness.
- Multiple dependencies are **ANDed** together.

## Examples

```ts
// Field-name — waits for presence + availability
requires('repeatEvery', 'startTime')

// check() bridge — waits for validity
requires('submit', check('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/))

// Predicate — custom logic
requires('endTime', ({ startTime }) => typeof startTime === 'string' && startTime.length > 0)
```

## Default reason

- `"requires <fieldName>"` for field-name dependencies
- `"required condition not met"` for predicate dependencies

## See also

- [Quick Start: requires](/learn/#requires) — interactive demo
- [Field Satisfaction Semantics](/concepts/satisfaction/) — how Umpire defines "present"
- [Topological Evaluation Order](/concepts/evaluation/) — why `requires` creates ordering edges
