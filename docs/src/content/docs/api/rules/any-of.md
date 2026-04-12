---
title: anyOf()
description: Pass if any inner rule passes — OR logic for availability.
---

Multiple rules targeting the same field are ANDed by default. Wrap them in `anyOf()` when any one successful path should unlock the target.

Use [`eitherOf()`](/umpire/api/rules/either-of/) when those OR paths need names and each path is itself a group of ANDed rules.

## Signature

```ts
anyOf(ruleA, ruleB, ruleC)
```

All inner rules must target the same fields, or creation throws.

## Example

```ts
anyOf(
  enabledWhen('submit', ({ password }) => !!password, {
    reason: 'Enter a password',
  }),
  enabledWhen('submit', (_values, conditions) => conditions.bypass === true, {
    reason: 'Bypass flag missing',
  }),
)
```

Either a password or a bypass flag unlocks submit. When both fail, all inner reasons are collected in `reasons`.

## Looking for allOf?

There is no `allOf()` — it is the default. Multiple rules targeting the same field are ANDed together by the evaluator without any explicit combinator:

```ts
// These two rules are implicitly ANDed on 'submit'
enabledWhen('submit', ({ email }) => !!email, { reason: 'Enter an email' }),
enabledWhen('submit', ({ password }) => !!password, { reason: 'Enter a password' }),
```

Both must pass for `submit` to be enabled.

If you need **AND groups composable inside OR logic** — for example, "path A requires condition 1 AND condition 2, OR path B requires condition 3 AND condition 4" — use [`eitherOf()`](/umpire/api/rules/either-of/). Each branch in `eitherOf` is an AND group, and branches are ORed:

```ts
eitherOf('submitAuth', {
  sso:      [enabledWhen('submit', hasSsoDomain), enabledWhen('submit', hasSsoToken)],
  password: [enabledWhen('submit', hasEmail), enabledWhen('submit', hasPassword)],
})
// equivalent to: anyOf(allOf(hasSsoDomain, hasSsoToken), allOf(hasEmail, hasPassword))
```

## See also

- [Quick Start: anyOf](/umpire/learn/#anyof) — interactive demo
- [`eitherOf()`](/umpire/api/rules/either-of/) — named OR branches built from rule groups
- [`enabledWhen()`](/umpire/api/rules/enabled-when/) — the most common inner rule for `anyOf`
