---
title: Signup Form Walkthrough
description: Step-by-step walkthrough of a signup form with availability checks and reset recommendations.
---

Users pick a plan — personal or business. Business accounts get extra fields for company name and size. When they switch back to personal, those fields need to go away and their stale values need to be flagged for cleanup. Four rules handle the whole thing.

## The Rules

```ts
import { enabledWhen, requires, umpire } from '@umpire/core'

const signupUmp = umpire({
  fields: {
    email:           { required: true, isEmpty: (v) => !v },
    password:        { required: true, isEmpty: (v) => !v },
    confirmPassword: { required: true, isEmpty: (v) => !v },
    referralCode:    {},
    companyName:     {},
    companySize:     {},
  },
  rules: [
    // Can't confirm what doesn't exist yet
    requires('confirmPassword', 'password'),

    // Company fields only on business plan
    enabledWhen('companyName',
      (_v, ctx) => ctx.plan === 'business',
      { reason: 'business plan required' }),
    enabledWhen('companySize',
      (_v, ctx) => ctx.plan === 'business',
      { reason: 'business plan required' }),

    // Company size needs a company name first
    requires('companySize', 'companyName'),
  ],
})
```

Six fields, four rules. The rules read top-to-bottom as English: "confirmPassword requires password. Company fields are enabled when the plan is business. Company size requires company name."

## Step 1 — Personal Plan, Password Entered

```ts
const result = signupUmp.check(
  { email: 'alex@example.com', password: 'hunter2' },
  { plan: 'personal' },
)
```

| Field | enabled | required | reason |
| --- | --- | --- | --- |
| email | `true` | `true` | `null` |
| password | `true` | `true` | `null` |
| confirmPassword | `true` | `true` | `null` |
| referralCode | `true` | `false` | `null` |
| companyName | `false` | `false` | `'business plan required'` |
| companySize | `false` | `false` | `'business plan required'` |

Company fields are off the field — personal plan, no business fields. `confirmPassword` is available because `password` is present. Notice `required` is suppressed to `false` on disabled fields. You can't require something that isn't available.

## Step 2 — Switch to Business Plan

Same values, different context:

```ts
const result = signupUmp.check(
  { email: 'alex@example.com', password: 'hunter2' },
  { plan: 'business' },
)
```

Now `companyName` is enabled — but `companySize` is still off:

```ts
result.companyName
// { enabled: true, required: false, reason: null, reasons: [] }

result.companySize
// { enabled: false, required: false,
//   reason: 'requires companyName', reasons: ['requires companyName'] }
```

Two rules layer here. `enabledWhen` opens the gate (business plan), then `requires` keeps `companySize` waiting until `companyName` has a value. The rules compose — you don't have to think about ordering.

## Step 3 — No Password Yet

```ts
const result = signupUmp.check(
  { email: 'alex@example.com' },
  { plan: 'personal' },
)

result.confirmPassword
// { enabled: false, required: false,
//   reason: 'requires password', reasons: ['requires password'] }
```

`password` is absent (undefined = not satisfied), so `confirmPassword` is disabled. The `required: false` suppression matters here — a validation library checking required fields won't flag `confirmPassword` as missing when it isn't even available.

## Step 4 — Switching Plans, Flagging Resets

The user filled out business fields, then switched back to personal. The values are still there, but the fields are no longer available. What should be cleaned up?

```ts
const penalties = signupUmp.flag(
  { values: { email: 'alex@example.com', password: 'hunter2',
              companyName: 'Acme', companySize: '50' },
    context: { plan: 'business' } },
  { values: { email: 'alex@example.com', password: 'hunter2',
              companyName: 'Acme', companySize: '50' },
    context: { plan: 'personal' } },
)

// [
//   { field: 'companyName', reason: 'business plan required',
//     suggestedValue: undefined },
//   { field: 'companySize', reason: 'business plan required',
//     suggestedValue: undefined },
// ]
```

Only context changed — the values are identical. `flag()` compares two full snapshots (values + context), so context-only transitions work naturally.

Three conditions had to be true for each recommendation:
1. The field was enabled in the "before" snapshot but disabled in "after"
2. The field's current value is not empty (per `isEmpty`)
3. The current value differs from `suggestedValue` (the field's `default`, or `undefined`)

Apply the recommendations to converge:

```ts
// After clearing the flagged fields:
signupUmp.flag(
  { values: { email: 'alex@example.com', password: 'hunter2',
              companyName: 'Acme', companySize: '50' },
    context: { plan: 'personal' } },
  { values: { email: 'alex@example.com', password: 'hunter2' },
    context: { plan: 'personal' } },
)
// → [] (nothing left to clean up)
```

## What This Doesn't Cover

Umpire doesn't validate that the email is well-formed, the password meets policy, or `confirmPassword` matches `password`. Those are correctness concerns. Umpire handles availability — whether fields should be on the field at all.
