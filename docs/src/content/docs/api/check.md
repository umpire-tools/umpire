---
title: ump.check()
description: Compute the availability map for the current values, conditions, and optional previous values.
---

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
type FieldStatus = {
  enabled: boolean
  satisfied: boolean
  fair: boolean
  required: boolean
  reason: string | null
  reasons: string[]
  valid?: boolean
  error?: string
}

type AvailabilityMap<F extends Record<string, FieldDef>> = {
  [K in keyof F]: FieldStatus
}
```

## Semantics

- `enabled` is the combined result of every availability rule (`enabledWhen`, `requires`, `disables`, `oneOf`) targeting the field.
- `satisfied` is whether the current value is non-empty under that field's `isEmpty` strategy.
- `fair` is `false` when a `fairWhen` predicate returns `false` on a non-empty value. Always `true` when the field has no value. `fairWhen` only runs when the field is enabled.
- `required` is suppressed to `false` when the field is disabled, even if the field definition says `required: true`.
- `reason` is the first failure in declaration order — from either an availability rule or a `fairWhen` rule.
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

## When to also use `play()`

`check()` tells you the current state of every field. That is exactly what you need for validation: walk the availability map, skip disabled fields, collect anything that is enabled but unsatisfied or foul.

What `check()` cannot tell you is whether a previously valid selection became stale because something else changed. Consider a scheduler where the user picks a timezone, then enables a "use local timezone" option. The timezone field is now disabled — but it still holds `"America/New_York"`. `check()` will correctly report it as disabled. It won't tell you that the value sitting there is now orphaned and should be cleared.

That is the job [`play()`](/api/play/) was designed for. It takes two snapshots — the state before the change and the state after — and returns a list of fields whose values became stale in the transition. You apply those recommendations however your state layer works; `play()` never mutates anything.

Most patch handlers need one or the other:

- If you're validating before saving, `check()` is sufficient.
- If a user action just changed which fields are active and you want to auto-reset the ones that fell out, reach for `play()`.

The case where you genuinely need both in the same handler is uncommon. A field switch that disables something stale calls for `play()`. A form submission that checks completeness calls for `check()`. They are rarely the same moment.
