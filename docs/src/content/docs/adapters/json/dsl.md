---
title: 'DSL & Portable Builders'
description: The expression vocabulary and portable rule builders for authoring Umpire models that round-trip through the JSON contract.
---

If you're writing rules that need to cross a runtime boundary, write them through the portable vocabulary instead of plain TypeScript predicates. This page covers that vocabulary: the `expr.*` expression DSL, the portable rule builders, and the round-trip guarantee they provide.

## Portable builders

The portable builders produce standard Umpire rules that also carry their own JSON definition from the moment they're created. They plug into `umpire()` the same as any other rule — the difference is that `toJson()` can reconstruct them exactly without guessing:

```ts
import { requiresJson, enabledWhenExpr, disablesExpr, fairWhenExpr, anyOfJson, expr } from '@umpire/json'
```

### `requiresJson(field, ...dependencies)`

Portable version of `requires()`. Dependencies are field name strings:

```ts
requiresJson('companyName', 'accountType')
requiresJson('ramSize', 'ramType', 'motherboard')

// With a reason
requiresJson('shippingAddress', 'useShipping', { reason: 'Provide a shipping address' })
```

### `enabledWhenExpr(field, expression, options?)`

Portable version of `enabledWhen()`. The predicate is an `expr.*` expression:

```ts
enabledWhenExpr('discountCode', expr.condEq('tier', 'pro'), {
  reason: 'Discount codes are only available on Pro',
})

enabledWhenExpr('vehicleType', expr.present('weight'), {
  reason: 'Enter weight first',
})
```

### `disablesExpr(source, targets, options?)`

Portable version of `disables()`. Pass a field name as the source, or leave it out if the disablement is condition-driven:

```ts
disablesExpr('bannerMode', ['paperSize', 'orientation'], {
  reason: 'Banner mode uses continuous feed',
})
```

### `fairWhenExpr(field, expression, options?)`

Portable version of `fairWhen()`. The fair predicate is an `expr.*` expression:

```ts
fairWhenExpr('planId', expr.fieldInCond('planId', 'validPlans'), {
  reason: 'That plan is no longer available',
})
```

### `anyOfJson(field, groups)`

Portable version of `anyOf()`. Groups are objects mapping branch names to arrays of dependent fields:

```ts
anyOfJson('handlingMode', {
  fragile: ['blankets', 'crateType'],
  climate: ['tempRange', 'humidity'],
})
```

---

## Expression vocabulary (`expr.*`)

`expr.*` builds the predicate expressions used inside portable builders. Import it from `@umpire/json`:

```ts
import { expr } from '@umpire/json'
```

### Value comparisons

These compare a field's current value against a literal:

| Expression | Meaning |
|---|---|
| `expr.eq(field, value)` | `field === value` |
| `expr.ne(field, value)` | `field !== value` |
| `expr.gt(field, value)` | `field > value` |
| `expr.gte(field, value)` | `field >= value` |
| `expr.lt(field, value)` | `field < value` |
| `expr.lte(field, value)` | `field <= value` |
| `expr.in(field, values)` | `values.includes(field)` |
| `expr.notIn(field, values)` | `!values.includes(field)` |

### Presence

| Expression | Meaning |
|---|---|
| `expr.present(field)` | field has a non-null, non-undefined value |
| `expr.absent(field)` | field is null or undefined |

### Condition expressions

These read from the `conditions` object rather than field values. Conditions are declared in the schema and provided by the runtime:

| Expression | Meaning |
|---|---|
| `expr.cond(name)` | condition value is truthy |
| `expr.condEq(name, value)` | `condition === value` |
| `expr.condIn(name, values)` | `values.includes(condition)` |
| `expr.fieldInCond(field, condition)` | condition is an array; `array.includes(fieldValue)` |

`expr.fieldInCond()` is the portable way to express "this field's current value must be in a server-provided list."

### Combinators

| Expression | Meaning |
|---|---|
| `expr.and(...expressions)` | all expressions must be true |
| `expr.or(...expressions)` | at least one expression must be true |
| `expr.not(expression)` | negate an expression |

These compose freely:

```ts
enabledWhenExpr('psu', expr.and(expr.present('cpu'), expr.present('gpu')), {
  reason: 'Select a CPU and GPU first',
})

enabledWhenExpr('holePunch', expr.and(
  expr.eq('printer', 'colorLaser'),
  expr.not(expr.eq('copies', 1)),
), {
  reason: 'Only the color laser supports hole-punching',
})
```

### `expr.check(field, validator)`

The field-bound check source. Evaluates to `true` when the named field satisfies a portable validator:

```ts
enabledWhenExpr('submit', expr.check('email', namedValidators.email()), {
  reason: 'Enter a valid email address first',
})
```

This is distinct from the top-level `"check"` rule type:

- **Top-level `"check"`** — a standalone availability constraint. The field is treated as unsatisfied if its value fails the check.
- **`expr.check()`** — a predicate source inside another rule. It asks "does this field currently satisfy this named constraint?" so a different field can depend on the answer.

When serialized, `expr.check()` produces a portable expression the receiving runtime knows how to evaluate:

```json
{
  "type": "enabledWhen",
  "field": "submit",
  "when": { "op": "check", "field": "email", "check": { "op": "email" } },
  "reason": "Enter a valid email address first"
}
```

---

## Round-trip guarantee

Rules built with the portable builders and `expr.*` expressions round-trip exactly through `fromJson()` / `toJson()`. The metadata attached at build time is preserved — `toJson()` restores the original definition rather than re-deriving it from the TypeScript predicate.

This gives three clear tiers:

| Authored with | `toJson()` output |
|---|---|
| Portable builders + `expr.*` | Exact round-trip |
| Core helpers + `namedValidators.*()` | Usually serializable via introspection |
| Plain TypeScript predicates | `excluded` |

The first tier is the only one with a guarantee. The second tier works for common patterns (`requires('a', 'b')`, `enabledWhen` with a `check()` predicate) but depends on introspection, which has limits. The third tier is always `excluded` — it still runs, it just won't cross runtimes.

---

## Conformance

The `conformance/` directory in the `@umpire/json` package contains fixture files that define the normative behavior for cross-runtime implementations. Each fixture describes a schema, an evaluation scenario (values + conditions), and the expected availability output.

The TypeScript implementation is the reference runtime. Other language ports are conformant when their output matches these fixtures for all scenarios.

---

## See also

- [`@umpire/json`](/umpire/adapters/json/) — `fromJson`, `toJson`, portable validators, conditions, `excluded`
- [Composing with Validation](/umpire/concepts/validation/) — conceptual boundary between availability and validation
- [check() helper](/umpire/api/rules/check/) — validator shapes in core
