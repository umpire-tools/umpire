---
title: Rules Overview
description: The built-in rule helpers for composing field availability.
---

Every rule helper returns a `Rule<F, C>` object. Rules are plain values — they can be composed, stored, and combined with `anyOf()` or `eitherOf()`.

| Rule | Purpose |
|------|---------|
| [`requires()`](/umpire/api/rules/requires/) | Field stays disabled until dependencies are satisfied and available |
| [`enabledWhen()`](/umpire/api/rules/enabled-when/) | Field enabled only when a predicate returns true |
| [`fairWhen()`](/umpire/api/rules/fair-when/) | Field's current value is appropriate only when a predicate returns true |
| [`disables()`](/umpire/api/rules/disables/) | Active source disables target fields |
| [`oneOf()`](/umpire/api/rules/one-of/) | Only one branch of fields is active at a time |
| [`anyOf()`](/umpire/api/rules/any-of/) | OR logic — pass if any inner rule passes |
| [`eitherOf()`](/umpire/api/rules/either-of/) | Named OR paths where each branch is a group of ANDed rules |
| [`check()`](/umpire/api/rules/check/) | Bridge validators into rules with preserved field metadata |

Try each one interactively on the [Quick Start](/umpire/learn/) page. For lint-time validation of `requires()`, `disables()`, and the rest — see the [ESLint Plugin](/umpire/extensions/eslint-plugin/).

## Custom Reasons

All rule helpers that accept `options.reason` support either a static string or a function.

```ts
enabledWhen('companyName', (_values, conditions) => conditions.plan === 'business', {
  reason: (_values, conditions) => `Plan "${conditions.plan}" cannot edit company details`,
})
```

Dynamic reasons are useful when the UI should explain a specific plan tier, feature flag, or external gate.

## Typing Conditions

Rule factories have their own generic parameters, so TypeScript can't always infer your conditions type from the `umpire()` call. When a predicate receives `conditions`, it may be typed as `Record<string, unknown>` instead of your specific type.

Two ways to fix this:

### `field<V>()` for per-field type capture

When a rule like `fairWhen` needs a typed `value` parameter, use a named [`field<V>()`](/umpire/api/field/) builder. It captures the value type for that field and flows it through to the predicate — no annotation needed.

```ts
const motherboard = field<string>('motherboard')

fairWhen(motherboard, (mb, values) => {
  //                   ^^ string, not unknown
  return socketFor(mb) === socketFor(values.cpu ?? '')
})
```

This is narrower than `createRules()` — it types one field at a time rather than the whole schema. Use `field<V>()` when you want typed predicates inline; use `createRules()` when many rules share the same field and condition types.

### Annotate the predicate

Type `conditions` directly in the callback. This works well for a handful of rules.

```ts
type Conditions = { plan: 'personal' | 'business' }

enabledWhen('companyName', (_v, c: Conditions) => c.plan === 'business', {
  reason: 'business plan required',
})
```

### `createRules()` for many rules

When you have many rules sharing the same field and condition types, `createRules()` returns typed versions of all rule factories. Type once, use everywhere.

```ts
import { createRules, umpire } from '@umpire/core'

type Conditions = {
  plan: 'personal' | 'business'
  isAdmin: boolean
}

const fields = {
  companyName: {},
  companySize: {},
  discountOverride: {},
}

const { enabledWhen, requires } = createRules<typeof fields, Conditions>()

// c.plan and c.isAdmin are fully typed in every predicate
const ump = umpire({
  fields,
  rules: [
    enabledWhen('companyName', (_v, c) => c.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('discountOverride', (_v, c) => c.isAdmin, {
      reason: 'admin only',
    }),
    requires('companySize', 'companyName'),
  ],
})
```

`createRules()` is purely a type-level convenience — zero runtime overhead. The returned functions are the same rule factories with narrowed generics.
