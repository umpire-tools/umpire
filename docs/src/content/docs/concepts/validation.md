---
title: Composing with Validation
description: Umpire handles availability. Validation libraries handle correctness. Here's how they work together.
---

Umpire decides whether a field is **available**. It does not decide whether a value is **correct**. But the two are often entangled — a field might need to be *valid* before a dependent field becomes available, or you might only want to validate fields that are currently *enabled*.

This page shows how to compose Umpire with validation libraries like Zod, Yup, or plain functions, without either tool stepping on the other.

## The boundary

| Concern | Owner | Example |
| --- | --- | --- |
| Should this field be in play? | Umpire | `confirmPassword` disabled until `password` is present |
| Is this value still an appropriate selection? | Umpire | `motherboard` inappropriate after CPU socket changes — `fairWhen` |
| Is this value well-formed? | Validation library | `email` must match a pattern |
| Is this value valid *and* should a dependent field become available? | Both, composed | `submit` requires a valid email — Umpire gates the field, `check()` bridges the validator |

The handoff point is `check()`. It wraps a validator into something Umpire can use as a rule source, without Umpire taking ownership of validation logic.

Validation still follows Umpire's satisfaction semantics. By default, only
`null` and `undefined` are treated as empty. That means `''` is considered
present and satisfied unless the field defines `isEmpty`.

If you want blank strings to behave like "not yet validateable" form input, give
the field an explicit empty-state rule:

```ts
import { isEmptyString } from '@umpire/core'

const ump = umpire({
  fields: {
    email: { required: true, isEmpty: isEmptyString },
  },
  rules: [],
})
```

Without that, a field can be `satisfied: true` and `valid: false` at the same
time, which is often the right result for non-empty invalid input.

## `check()` is the bridge

`check(field, validator)` creates a predicate that Umpire can use inside `requires()`, `enabledWhen()`, or `disables()`. The validator runs against the field's current value and returns a boolean.

Supported validator shapes:

```ts

// Plain function
check('weight', (v) => typeof v === 'number' && v > 0)

// RegExp
check('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/)

// Zod schema (anything with .safeParse)
check('email', z.string().email())

// Yup schema (anything with .test — isValidSync)
check('zipCode', yup.string().matches(/^\d{5}$/))

// or there are some built-in!
import { checks } from '@umpire/json'

// Named check — portable through @umpire/json
check('email', checks.email())
```

The key insight: `check()` preserves the field name internally. The dependency graph knows this predicate reads from `email`, so `challenge()` can explain why `submit` is disabled and trace it back to the email field.

## Pattern: gate a dependent field on validity

The most common composition — a field stays disabled until another field is both present and valid.

```ts
import { z } from 'zod'
import { umpire, requires, enabledWhen, check } from '@umpire/core'

const emailSchema = z.string().email()

const ump = umpire({
  fields: {
    email:    { required: true, isEmpty: (v) => !v },
    password: { required: true, isEmpty: (v) => !v },
    submit:   {},
  },
  rules: [
    // submit needs a valid email and a present password
    requires('submit', check('email', emailSchema), 'password'),
  ],
})
```

`requires()` handles both pieces: `check('email', emailSchema)` demands validity, `'password'` demands presence. If either fails, `submit` stays disabled with a reason.

## Pattern: only validate enabled fields

Run your validation library on the full form, then intersect with Umpire's availability map. Disabled fields don't need validation — they're not in play.

```ts
const availability = ump.check(values, conditions)
const zodResult = formSchema.safeParse(values)

const activeErrors: Record<string, string> = {}

if (!zodResult.success) {
  for (const issue of zodResult.error.issues) {
    const field = issue.path[0] as string
    // Only show errors for fields that are currently enabled
    if (availability[field]?.enabled) {
      activeErrors[field] = issue.message
    }
  }
}
```

This avoids the common annoyance of validation errors on fields the user can't even see. A `companyName` that's required by Zod but disabled by Umpire (because the user is on a personal plan) shouldn't flash red.

## Pattern: required means enabled + required

Umpire suppresses `required` on disabled fields. A field definition can say `required: true`, but `check()` will report `required: false` when the field is disabled. Validation libraries should respect this.

```ts
const availability = ump.check(values, conditions)

// Build a dynamic Zod schema from availability
const shape: Record<string, z.ZodTypeAny> = {}

for (const [field, status] of Object.entries(availability)) {
  if (!status.enabled) continue // skip disabled fields entirely

  const base = fieldSchemas[field] // your per-field Zod schema
  shape[field] = status.required ? base : base.optional()
}

const activeSchema = z.object(shape)
```

## What stays in userspace

Umpire does not:

- Run async validators (API calls to check uniqueness, etc.)
- Collect or display error messages — that's your form UI
- Decide *when* to validate (on blur, on submit, on change)
- Coerce or transform values

These are all form-framework concerns. Umpire's job ends at "is this field available and is it required?" Your validation layer takes it from there.

## See also

- [Satisfaction semantics](/concepts/satisfaction/) — how Umpire defines "present"
- [`check()` in the rules API](/api/rules/#checkfield-validator) — full signature and validator shapes
- [`@umpire/json`](/umpire/adapters/json/) — portable schemas, named checks, and `excluded`
- [Availability vs validation](/concepts/availability/#availability-is-structural) — the core distinction
