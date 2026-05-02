---
title: enabledWhen()
description: Enable a field only when a predicate returns true.
---

Enables a field only when the predicate returns `true`. The most common rule for condition-driven gating — plan tiers, feature flags, permissions, environment checks.

## Signature

```ts
enabledWhen(
  field,
  (values, conditions) => boolean,
  {
    reason?: string | ((values, conditions) => string)
  },
)
```

## Example

```ts
enabledWhen('companyName', (_values, conditions) => conditions.plan === 'business', {
  reason: 'business plan required',
})
```

## Default reason

`"condition not met"`

## See also

- [Quick Start: enabledWhen](/learn/#enabledwhen) — interactive demo
- [`check()`](/api/rules/check/) — bridge validators into `enabledWhen` predicates
- [Custom Reasons](/api/rules/#custom-reasons) — static and dynamic reason strings
