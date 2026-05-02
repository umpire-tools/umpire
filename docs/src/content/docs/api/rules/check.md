---
title: check() helper
description: Wrap a validator and bind it to a field so it can act as a predicate source inside other rules.
---

`check()` is a predicate factory — it wraps a validator and binds it to a field, producing something other rules can consume as a dependency source. It is not itself a rule, and you do not add it directly to the `rules` array.

> **Note:** This is the `check()` helper from `@umpire/core` — not `ump.check()`, the evaluation method. They share a name because they share a concept: "is this field's value satisfactory?" The helper answers that question inside a rule predicate; `ump.check()` answers it across all fields at once.

## Signature

```ts
check(field, validator): Predicate
```

## How it's used

`check()` produces a predicate that you pass to rules as a dependency source:

```ts
import { check, enabledWhen, requires } from '@umpire/core'

// `submit` stays disabled until `email` passes the validator
enabledWhen('submit', check('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/), {
  reason: 'Enter a valid email address',
})

// `submit` won't be required until `email` is satisfied
requires('submit', check('email', z.string().email()))
```

This means `check('email', validator)` is doing two jobs at once: it reads from `email`, and it evaluates the validator against that value. The rule it's passed to treats the result as a field dependency — the same way it would treat `requires('submit', 'email')`, except the condition is "email passes the validator" rather than "email has any value."

## Supported validators

- `(value: unknown) => boolean` — plain function
- `namedValidators.email()` and other named validators from `@umpire/json`
- `{ safeParse(value): { success: boolean } }` — Zod schemas
- `{ test(value): boolean }` — RegExp and similar

## Why `check()` preserves the field name

When you write `check('email', validator)`, the resulting predicate carries `email` as its source field. Umpire uses this to build the dependency graph — `challenge()` will correctly show that `submit` depends on `email` even though the predicate is not a direct field reference.

For `enabledWhen()`, that field relationship is informational: it appears in the graph and scorecard output, but does not add an ordering edge. For `requires()`, it does create an ordering edge.

## Portable validators

If you want a `check()` predicate to survive `toJson()` / `fromJson()`, use a named check from `@umpire/json`:

```ts
import { namedValidators } from '@umpire/json'

enabledWhen('submit', check('email', namedValidators.email()), {
  reason: 'Enter a valid email address',
})
```

Plain functions, regexes, and library schemas run fine at runtime — they just can't serialize. `toJson()` places them in `excluded`. Named checks carry stable metadata so the JSON contract can reconstruct them exactly.

In `@umpire/json`, this same pattern maps to either a top-level `"check"` rule or an `expr.check()` expression depending on context. See [`@umpire/json`](/extensions/json/) for how the two portable forms work.

## See also

- [ump.check()](/api/check/) — the evaluation method (different function, same concept)
- [Quick Start: check](/learn/#check) — interactive demo
- [Composing with Validation](/concepts/validation/) — patterns for using Umpire alongside Zod, Yup, etc.
- [`@umpire/json`](/extensions/json/) — portable schemas, named checks, and `excluded`
