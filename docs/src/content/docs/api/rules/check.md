---
title: check() helper
description: Bridge validators into availability rules with preserved field metadata.
---

`check()` is a predicate factory, not a standalone rule. It wraps a validator and preserves the field name, so it works naturally inside `enabledWhen()`, `requires()`, or `disables()`.

## Signature

```ts
check(field, validator)
```

## Supported validators

- `(value: unknown) => boolean` — plain function
- `checks.email()` and other named checks from `@umpire/json`
- `{ safeParse(value): { success: boolean } }` — Zod schemas
- `{ test(value): boolean }` — RegExp and similar

## Examples

```ts
// RegExp
enabledWhen('submit', check('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/), {
  reason: 'Enter a valid email address',
})

// Zod schema
requires('submit', check('email', z.string().email()))

// Plain function
requires('submit', check('weight', (v) => typeof v === 'number' && v > 0))
```

If you need a validator to survive `toJson()` / `fromJson()`, prefer the named `checks.*()` helpers from `@umpire/json`. Plain functions, regexes, and library schemas still work at runtime, but they stay TypeScript-specific.

## Why `check()` preserves the field name

Because `check()` attaches the field name internally, the dependency graph can trace the relationship — `challenge()` will show that `submit` depends on `email` even though `check()` is a predicate, not a field-name reference.

For `enabledWhen()`, that preserved relationship is informational: it shows up in graph export and field validation, but it does not become an ordering edge. For `requires()`, it does create an ordering edge.

## See also

- [Quick Start: check](/umpire/learn/#check) — interactive demo
- [Composing with Validation](/umpire/concepts/validation/) — patterns for using Umpire alongside Zod, Yup, etc.
- [`@umpire/json`](/umpire/adapters/json/) — portable schemas, named checks, and `excluded`
