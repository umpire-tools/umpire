---
title: '@umpire/dsl'
description: Pure expression types, builders, and compiler for programmatic rules with no serialization dependency.
---

When you write Umpire rules entirely in TypeScript — no JSON schemas, no round-tripping across runtimes — `@umpire/dsl` is the only expression package you need. It owns the `Expr` type, the `expr` builder, and the compiler that turns expressions into runtime predicates.

If your rules need to survive a JSON boundary, `@umpire/json` re-exports everything here as a superset — same `expr`, `compileExpr`, and `getExprFieldRefs`, plus `expr.check()` and the portable builders. This page is the reference for all of it; just import from `@umpire/json` instead.

## Install

```bash
yarn add @umpire/dsl
```

## `expr`

`expr` is the expression builder. Each method returns an `Expr` object you can pass to rule factories or compose with `and`, `or`, and `not`.

```ts
import { expr } from '@umpire/dsl'

const when = expr.and(
  expr.present('country'),
  expr.gt('total', 100),
)
```

Array and object payloads are cloned on construction, so mutating a `values` array after passing it to `expr.in()` does not affect the expression.

### Field comparison

| Method | Signature | True when |
|--------|-----------|-----------|
| `eq` | `(field, value: JsonPrimitive) => Expr` | field strictly equals value |
| `neq` | `(field, value: JsonPrimitive) => Expr` | field does not strictly equal value |
| `gt` | `(field, value: number) => Expr` | field is a number greater than value |
| `gte` | `(field, value: number) => Expr` | field is a number greater than or equal to value |
| `lt` | `(field, value: number) => Expr` | field is a number less than value |
| `lte` | `(field, value: number) => Expr` | field is a number less than or equal to value |
| `present` | `(field) => Expr` | field is not `null` or `undefined` |
| `absent` | `(field) => Expr` | field is `null` or `undefined` |
| `truthy` | `(field) => Expr` | field is truthy |
| `falsy` | `(field) => Expr` | field is falsy |
| `in` | `(field, values: JsonPrimitive[]) => Expr` | field value is in the list |
| `notIn` | `(field, values: JsonPrimitive[]) => Expr` | field value is not in the list |

### Logical combinators

| Method | Signature | Meaning |
|--------|-----------|---------|
| `and` | `(...exprs: Expr[]) => Expr` | all sub-expressions must be true |
| `or` | `(...exprs: Expr[]) => Expr` | at least one sub-expression must be true |
| `not` | `(expr: Expr) => Expr` | inverts the sub-expression |

### Condition ops

Conditions are external values provided by the host runtime — account tier, feature flags, server-supplied sets. They are declared on the schema, not on individual fields.

| Method | Signature | True when |
|--------|-----------|-----------|
| `cond` | `(condition) => Expr` | condition is truthy |
| `condEq` | `(condition, value: JsonPrimitive) => Expr` | condition strictly equals value |
| `condIn` | `(condition, values: JsonPrimitive[]) => Expr` | condition value is in the list |
| `fieldInCond` | `(field, condition) => Expr` | field value is contained in the condition array |

`fieldInCond` requires an array condition at compile time — the `type` must be `'string[]'` or `'number[]'`. At runtime it throws if the condition value is not an array.

```ts
import { expr, compileExpr } from '@umpire/dsl'

// A plan-gated feature: the selected plan must be in the set the server says are eligible
const when = expr.fieldInCond('plan', 'eligiblePlans')

// Compiles assuming eligiblePlans was declared as { type: 'string[]' }
const predicate = compileExpr(when, {
  fieldNames: new Set(['plan']),
  conditions: { eligiblePlans: { type: 'string[]' } },
})

predicate({ plan: 'pro' }, { eligiblePlans: ['pro', 'enterprise'] }) // true
predicate({ plan: 'free' }, { eligiblePlans: ['pro', 'enterprise'] }) // false
```

## `compileExpr(expression, options)`

Compiles an `Expr` into a predicate function.

```ts
function compileExpr<F, C>(
  expression: Expr,
  options: {
    fieldNames: Set<string>
    conditions?: Record<string, { type: 'boolean' | 'string' | 'number' | 'string[]' | 'number[]' }>
    allowUndeclaredConditions?: boolean
  },
): (values: FieldValues<F>, conditions: C) => boolean
```

`compileExpr` validates the expression at compile time:

- Every field referenced must appear in `fieldNames`. Unknown fields throw.
- Every condition referenced must appear in `conditions`, unless `allowUndeclaredConditions` is `true`.
- `fieldInCond` additionally requires the condition type to be `'string[]'` or `'number[]'`.

The returned predicate accepts current field values and runtime conditions.

```ts
import { compileExpr, expr } from '@umpire/dsl'

const when = expr.and(
  expr.present('country'),
  expr.gt('total', 100),
)

const predicate = compileExpr(when, {
  fieldNames: new Set(['country', 'total']),
})

predicate({ country: 'US', total: 150 }, {}) // true
predicate({ country: null, total: 150 }, {}) // false
```

When the expression references exactly one field, the compiled predicate carries a `_checkField` property naming that field. Rule factories use this to attach structural dependency information without re-parsing the expression.

## `getExprFieldRefs(expression)`

Returns the unique set of field names referenced by an expression.

```ts
function getExprFieldRefs(expression: Expr): string[]
```

```ts
import { getExprFieldRefs, expr } from '@umpire/dsl'

const when = expr.and(
  expr.present('country'),
  expr.gt('total', 100),
  expr.gt('total', 50),  // duplicate reference
)

getExprFieldRefs(when) // ['country', 'total']
```

Condition-only ops (`cond`, `condEq`, `condIn`) contribute no field refs. `fieldInCond` contributes its field operand but not its condition operand.

## `Expr`

`Expr` is the union type of all expression AST nodes. You typically don't construct these by hand — use `expr.*` — but the type is useful when you're storing or passing expressions around:

```ts
import type { Expr } from '@umpire/dsl'

function buildAvailabilityExpr(role: string): Expr {
  if (role === 'admin') return expr.truthy('adminEnabled')
  return expr.present('orgId')
}
```

## `ExprBuilder<F, C>`

`ExprBuilder<F, C>` is the typed shape of `expr`, parameterized over field names `F` and condition keys `C`. At module scope, `expr` is typed as `ExprBuilder<Record<string, FieldDef>, Record<string, unknown>>` — it accepts any string. To get autocomplete on your specific field and condition names, narrow the type:

```ts
import type { ExprBuilder } from '@umpire/dsl'
import type { SignupFields, SignupConditions } from './schema'

declare const e: ExprBuilder<SignupFields, SignupConditions>
// e.present('email')     — valid
// e.present('typo')      — TypeScript error
```

The typed builder is most useful when authoring rules in a factory function where you want the compiler to catch field name mistakes.

## What this package does not include

`expr.check()` is not part of `@umpire/dsl`. Checks that depend on named validators — `namedValidators.email()`, `namedValidators.minLength(n)`, and so on — live in `@umpire/json`. If you need to express "this field is available only when another field passes an email validator," use `@umpire/json` directly. Its `expr` is a drop-in superset.

## See also

- [`@umpire/json` builders & checks](/extensions/json/builders/) — `expr.check()`, `namedValidators`, and portable rule builders
- [`@umpire/json` overview](/extensions/json/) — JSON schema contract, `fromJson`, `toJson`
