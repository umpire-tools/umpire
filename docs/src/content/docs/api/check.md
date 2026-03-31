---
title: ump.check()
description: Compute the availability map for the current values, conditions, and optional previous values.
---

# `ump.check()`

`check()` is the main evaluation API. It is pure, synchronous, and side-effect free.

## Signature

```ts
ump.check(
  values: InputValues,
  conditions?: C,
  prev?: InputValues,
): AvailabilityMap<F>
```

## Values

`values` accepts any `Record<string, unknown>` — pass your form state, store snapshot, or any object directly. Umpire only reads keys that match declared field names; extra keys are silently ignored. This means you don't need to transform or filter your state before calling `check()`.

**What about typos?** If you pass `{ emai: 'alex@example.com' }` when the field is named `email`, umpire won't error — it just sees `email` as empty. But the result will tell you: any rule that depends on `email` being satisfied (like `requires('confirmPassword', 'email')`) will report it as disabled with its reason. The availability map always uses the field names you declared, so the mismatch is visible in the output.

## Return Shape

```ts
type FieldAvailability = {
  enabled: boolean
  required: boolean
  reason: string | null
  reasons: string[]
}

type AvailabilityMap<F extends Record<string, FieldDef>> = {
  [K in keyof F]: FieldAvailability
}
```

## Semantics

- `enabled` is the combined result of every rule targeting the field.
- `required` is suppressed to `false` when the field is disabled, even if the field definition says `required: true`.
- `reason` is the first failure in declaration order.
- `reasons` includes every failure in declaration order.

## Conditions

Use `conditions` for external data that affects availability but is not itself a field value.

```ts
const availability = signupUmp.check(values, { plan: 'business' })
```

Typical conditions inputs:

- plan tier
- captcha token
- feature flags
- loaded palette metadata

## `prev`

`prev` is mainly for `oneOf()` branch resolution.

When multiple branches are satisfied at once, Umpire can use the previous values snapshot to determine which branch became active most recently.

```ts
const prev = { everyHour: [9, 17] }
const next = { everyHour: [9, 17], startTime: '09:00' }

ump.check(next, undefined, prev)
```

Without `prev`, ambiguous `oneOf()` situations fall back to the first satisfied branch and emit a development warning.

## Example

```ts
const result = loginUmp.check(
  { email: 'not-an-email', password: '' },
  { captchaToken: 'cf-turnstile-xxxx' },
)

result.submit
// {
//   enabled: false,
//   required: false,
//   reason: 'Enter a valid email address',
//   reasons: ['Enter a valid email address', 'Enter a password'],
// }
```

## Required Suppression

Disabled fields never stay required.

```ts
const result = signupUmp.check(
  { companyName: 'Acme' },
  { plan: 'personal' },
)

result.companyName.required
// false
```

That behavior keeps validation layers from flagging disabled fields as missing.
