---
title: 'Builders & Checks'
description: Expression building, named validators, and portable rule builders in @umpire/json.
---

When your rules need to survive a JSON boundary — serialized to a schema, stored in a database, sent from a server — you build them through `@umpire/json`. This page covers the expression and rule-building surface: the `expr` builder, `compileExpr`, `getExprFieldRefs`, named validators, and the portable rule factories.

Everything here is imported from `@umpire/json` only. You do not need `@umpire/dsl` as a separate dependency.

## `expr`

`@umpire/json` exports its own `expr` builder that is a strict superset of the one in `@umpire/dsl`. All the same field comparison, logical combinator, and condition ops are available, plus one addition: `expr.check()`.

```ts
import { expr } from '@umpire/json'

// All dsl ops work exactly the same
const when = expr.and(
  expr.present('country'),
  expr.gt('total', 100),
)

// Plus check() — only in @umpire/json
const emailReady = expr.check('email', namedValidators.email())
```

For the full field and condition op reference, see [`@umpire/dsl`](/umpire/extensions/dsl/). All those signatures carry over unchanged — `@umpire/json`'s `expr` extends that interface with `check()` rather than replacing it.

### `expr.check(field, validator)`

```ts
check: (field: keyof F & string, validator: NamedCheck<unknown>) => JsonExpr
```

`expr.check()` builds a predicate expression that evaluates to true when the named field has a non-null value that passes the given named validator. It is the portable way to express "this field is available only when another field passes a format check."

```ts
import { expr, namedValidators, enabledWhenExpr } from '@umpire/json'

// The submit button becomes available only when email is present and well-formed
enabledWhenExpr('submit', expr.check('email', namedValidators.email()), {
  reason: 'Enter a valid email address first',
})
```

`expr.check()` requires a validator from `namedValidators` — the validator must carry portable metadata that `toJson()` can serialize. Passing an arbitrary function throws at construction time.

At runtime, `expr.check()` returns false (not throws) when the field value is `null` or `undefined`. This matches the behavior of the surrounding rule: a field that hasn't been filled in yet is simply not ready.

## `compileExpr(expression, options)`

`@umpire/json` exports its own `compileExpr` that handles the `check` op in addition to all pure DSL nodes.

```ts
import { compileExpr } from '@umpire/json'
```

The signature is the same as the DSL version, and the behavior is identical for pure expressions. For expressions containing `check` ops, it validates the validator spec at compile time and wires the named check metadata so that `challenge()` traces can report which validator failed and why.

```ts
const when = expr.check('email', namedValidators.email())

const predicate = compileExpr(when, {
  fieldNames: new Set(['email']),
})

predicate({ email: 'alice@example.com' }, {}) // true
predicate({ email: 'not-an-email' }, {})       // false
predicate({ email: null }, {})                  // false
```

You can mix `check` ops inside `and` / `or`:

```ts
const when = expr.and(
  expr.present('username'),
  expr.check('email', namedValidators.email()),
)

const predicate = compileExpr(when, {
  fieldNames: new Set(['username', 'email']),
})
```

## `getExprFieldRefs(expression)`

`@umpire/json` exports its own `getExprFieldRefs` that handles the `check` op. A `check` node contributes its field operand, just like `present` or `eq`.

```ts
import { getExprFieldRefs } from '@umpire/json'

getExprFieldRefs(expr.check('email', namedValidators.email())) // ['email']
getExprFieldRefs(expr.and(expr.present('username'), expr.check('email', namedValidators.email())))
// ['username', 'email']
```

## `namedValidators`

Named validators are the portable value-constraint helpers. They carry stable metadata that `toJson()` can serialize and `fromJson()` can reconstruct exactly.

```ts
import { namedValidators } from '@umpire/json'
```

| Validator | Signature | Passes when |
|-----------|-----------|-------------|
| `email()` | `() => NamedCheck<string>` | value matches practical email syntax |
| `url()` | `() => NamedCheck<string>` | value is an absolute URL with a scheme |
| `matches(pattern)` | `(pattern: string) => NamedCheck<string>` | value matches the regex pattern |
| `minLength(n)` | `(value: number) => NamedCheck<string \| unknown[]>` | string or array length is at least `n` |
| `maxLength(n)` | `(value: number) => NamedCheck<string \| unknown[]>` | string or array length is at most `n` |
| `min(n)` | `(value: number) => NamedCheck<number>` | number is at least `n` |
| `max(n)` | `(value: number) => NamedCheck<number>` | number is at most `n` |
| `range(min, max)` | `(min: number, max: number) => NamedCheck<number>` | number is within the inclusive range |
| `integer()` | `() => NamedCheck<number>` | number is an integer |

All validators return false (not throw) when the field value is `null` or `undefined`. The surrounding rule decides whether absence is itself a problem.

Plain functions, regexes, and third-party validators work with `check()` from `@umpire/core`, but they do not serialize. Use `namedValidators.*()` anywhere you need `toJson()` to write the check and `fromJson()` to rebuild it.

## JSON-aware rule builders

These builders return normal core rules with JSON metadata attached. That metadata is what `toJson()` writes out — it is also what lets `fromJson()` reconstruct the rule exactly on the other side.

All options objects accept an optional `reason` string that will appear in the rule's JSON definition.

### `enabledWhenExpr(field, when, options?)`

```ts
function enabledWhenExpr<F, C>(
  field: keyof F & string,
  when: JsonExpr,
  options?: { reason?: string },
): Rule<F, C>
```

Makes `field` available only when `when` evaluates to true.

```ts
enabledWhenExpr('vatNumber', expr.eq('country', 'DE'), {
  reason: 'VAT number is only required for German accounts',
})
```

### `requiresExpr(field, when, options?)`

```ts
function requiresExpr<F, C>(
  field: keyof F & string,
  when: JsonExpr,
  options?: { reason?: string },
): Rule<F, C>
```

Marks `field` as required when `when` evaluates to true.

```ts
requiresExpr('referralCode', expr.eq('signupSource', 'referral'), {
  reason: 'Enter the referral code you received',
})
```

### `requiresJson(field, ...dependencies)`

```ts
function requiresJson<F, C>(
  field: keyof F & string,
  ...dependencies: Array<string | JsonExpr | { reason?: string }>,
): Rule<F, C>
```

The portable form of `requires()`. Accepts field name strings, `JsonExpr` expressions, or a mix, with an optional trailing options object.

```ts
// Require email before the submit button
requiresJson('submit', 'email')

// Require both fields
requiresJson('submit', 'email', 'termsAccepted')

// Expression dependency
requiresJson('submit', expr.check('email', namedValidators.email()))

// Mixed: string and expression
requiresJson('submit', 'termsAccepted', expr.check('email', namedValidators.email()))
```

### `disablesExpr(when, targets, options?)`

```ts
function disablesExpr<F, C>(
  when: JsonExpr,
  targets: Array<keyof F & string>,
  options?: { reason?: string },
): Rule<F, C>
```

Removes a set of fields from play when `when` evaluates to true. Use when a condition makes entire field groups irrelevant.

```ts
disablesExpr(
  expr.eq('accountType', 'personal'),
  ['vatNumber', 'companyName', 'registrationNumber'],
  { reason: 'Business fields are not relevant for personal accounts' },
)
```

### `fairWhenExpr(field, when, options?)`

```ts
function fairWhenExpr<F, C>(
  field: keyof F & string,
  when: JsonExpr,
  options?: { reason?: string },
): Rule<F, C>
```

Attaches a fairness predicate to `field`. The field is in play regardless, but its value is considered appropriate only when `when` evaluates to true.

```ts
fairWhenExpr('email', expr.check('email', namedValidators.email()), {
  reason: 'Must be a valid email address',
})
```

### `anyOfJson(...rules)`

```ts
function anyOfJson<F, C>(
  ...rules: Array<Rule<F, C>>,
): Rule<F, C>
```

Composes rules so that the group is satisfied when any one branch passes. All inner rules must be portable (built through the JSON builders) so the group can serialize.

```ts
anyOfJson(
  requiresExpr('phone', expr.absent('email')),
  requiresExpr('email', expr.absent('phone')),
)
```

### `eitherOfJson(group, branches)`

```ts
function eitherOfJson<F, C>(
  groupName: string,
  branches: Record<string, Array<Rule<F, C>>>,
): Rule<F, C>
```

Mutually exclusive rule branches. Exactly one branch applies based on current field state. All inner rules must be portable.

```ts
eitherOfJson('delivery', {
  pickup: [requiresJson('storeId')],
  shipped: [requiresJson('street'), requiresJson('city'), requiresJson('postcode')],
})
```

## See also

- [`@umpire/json` overview](/umpire/adapters/json/) — `fromJson`, `toJson`, conditions, and portability
- [`@umpire/dsl`](/umpire/extensions/dsl/) — the pure expression layer for programmatic-only rules
