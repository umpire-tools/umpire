---
title: eitherOf()
description: Named OR paths built from ANDed rule groups.
---

Named OR paths — each branch is a group of rules that must all pass together (AND). If any branch fully satisfies, the outer rule passes (OR). Name your branches when you need to debug which path matched, or when each path is more than one rule.

Unlike [`oneOf()`](/umpire/api/rules/one-of/), `eitherOf()` does not disable sibling branches and does not resolve a single active branch. Multiple branches may match at once.

Reach for [`anyOf()`](/umpire/api/rules/any-of/) when the OR paths are single rules and you don't need them named. Reach for `eitherOf()` when each path has multiple rules, or when you want `challenge()` to tell you exactly which path matched.

## Signature

```ts
eitherOf(
  groupName,
  {
    branchA: [ruleA, ruleB],
    branchB: [ruleC],
  },
)
```

Each branch must be non-empty. All inner rules across all branches must target the same fields and share the same constraint (`enabled` or `fair`).

## Semantics

- Rules inside a branch are ANDed.
- Branches are ORed.
- If any branch passes, the outer rule passes.
- If every branch fails, the outer rule's `reason` is the first inner reason of the first failing branch. `challenge()` gives you the full per-branch breakdown.
- Multiple branches may pass at once.

## Example

```ts
eitherOf('submitAuth', {
  // SSO path: the IdP handles auth — no password needed
  sso: [
    enabledWhen('submit', (_v, c) => c.sso, {
      reason: 'No SSO available for this domain',
    }),
  ],
  // Password path: email + password must both check out
  password: [
    enabledWhen('submit', check('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/), {
      reason: 'Enter a valid email address',
    }),
    enabledWhen('submit', ({ password }) => !!password, {
      reason: 'Enter a password',
    }),
    enabledWhen('submit', ({ confirmPassword, password }) => confirmPassword === password, {
      reason: 'Passwords must match',
    }),
  ],
})
```

Submit unlocks the moment either branch fully passes. If you're on a known SSO domain, the password branch is irrelevant — and vice versa. Neither branch locks the other out.

## Challenge Output

`challenge()` preserves the group name, each branch's inner results, and which branches matched. This makes it straightforward to see exactly why a path failed — or confirm which one succeeded.

```ts
// When all branches fail:
{
  rule: 'eitherOf',
  group: 'submitAuth',
  passed: false,
  reason: 'No SSO available for this domain',  // first inner reason of first failing branch
  matchedBranches: [],
  branches: {
    sso: {
      passed: false,
      inner: [{ rule: 'enabledWhen', reason: 'No SSO available for this domain', passed: false }],
    },
    password: {
      passed: false,
      inner: [
        { rule: 'enabledWhen', reason: 'Enter a valid email address', passed: false },
        { rule: 'enabledWhen', reason: 'Enter a password', passed: false },
      ],
    },
  },
}

// When the 'password' branch passes:
{
  rule: 'eitherOf',
  group: 'submitAuth',
  passed: true,
  matchedBranches: ['password'],
  branches: {
    sso:      { passed: false, inner: [...] },
    password: { passed: true,  inner: [...] },
  },
}
```

## Creation-time validation

`eitherOf()` rejects at creation time if:

- no branches are provided
- any branch has zero inner rules
- inner rules across branches target different fields
- inner rules mix `enabledWhen` and `fairWhen` (constraint must be consistent)

## See also

- [Quick Start: eitherOf](/umpire/learn/#eitherof) — interactive demo
- [`anyOf()`](/umpire/api/rules/any-of/) — plain OR across single rules, no branch names
- [`oneOf()`](/umpire/api/rules/one-of/) — mutually exclusive field branches
- [Signup Form example](/umpire/examples/signup/) — `eitherOf` wiring SSO and password auth paths on a real form
