---
title: Composing with Validation
description: Umpire handles availability. Validation libraries handle correctness. Here's how they work together.
---

Umpire decides whether a field is **available**. It does not decide whether a value is **correct**. But the two are often entangled — a field might need to be *valid* before a dependent field becomes available, or you might only want to validate fields that are currently *enabled*.

For the common case — building a schema that reflects current availability and filtering errors to active fields — [`@umpire/zod`](/umpire/integrations/zod/) handles the wiring. This page covers the conceptual boundary and the `check()` bridge that makes composition work regardless of which library you use.

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

// Named check — portable through @umpire/json
import { checks } from '@umpire/json'
check('email', checks.email())
```

The key insight: `check()` preserves the field name internally. The dependency graph knows this predicate reads from `email`, so `challenge()` can explain why `submit` is disabled and trace it back to the email field.

## Pattern: gate a dependent field on validity

The most common composition — a field stays disabled until another field is both present and valid.

```ts
import { z } from 'zod'
import { umpire, requires, check } from '@umpire/core'

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

## How availability maps to validation

Two rules apply at the boundary between Umpire and your validation library:

**Disabled fields are not in play.** A `companyName` that's required by Zod but disabled by Umpire (because the user is on a personal plan) should never flash red. Only validate fields that are currently enabled.

**`required` follows Umpire's output, not your static schema.** A field can be declared `required: true` in the engine config but report `required: false` when disabled. Your validation layer should respect this — `status.required` is the authoritative signal.

`@umpire/zod`'s `activeSchema` and `activeErrors` encode both rules directly. If you need the manual version — for a library without a first-class integration, or to understand what's happening under the hood:

```ts
const availability = ump.check(values, conditions)

// Build a schema that skips disabled fields and respects required/optional
const shape: Record<string, z.ZodTypeAny> = {}
for (const [field, status] of Object.entries(availability)) {
  if (!status.enabled) continue
  const base = fieldSchemas[field]
  shape[field] = status.required ? base : base.optional()
}
const schema = z.object(shape)
const result = schema.safeParse(values)

// Filter errors to enabled fields only
const activeErrors: Record<string, string> = {}
if (!result.success) {
  for (const issue of result.error.issues) {
    const field = issue.path[0] as string
    if (availability[field]?.enabled) {
      activeErrors[field] = issue.message
    }
  }
}
```

This is exactly what `activeSchema` and `activeErrors` do. See [Validator Integrations](/umpire/integrations/validators/) for the general pattern and how it extends to other libraries.

## What stays in userspace

Umpire does not:

- Run async validators (API calls to check uniqueness, etc.)
- Collect or display error messages — that's your form UI
- Decide *when* to validate (on blur, on submit, on change)
- Coerce or transform values

These are all form-framework concerns. Umpire's job ends at "is this field available and is it required?" Your validation layer takes it from there.

## See also

- [Validator Integrations](/umpire/integrations/validators/) — the integration contract and how it applies to any library
- [`@umpire/zod`](/umpire/integrations/zod/) — first-class Zod integration with `activeSchema` and `activeErrors`
- [Satisfaction semantics](/umpire/concepts/satisfaction/) — how Umpire defines "present"
- [`check()` in the rules API](/umpire/api/rules/check/) — full signature and validator shapes
- [`@umpire/json`](/umpire/adapters/json/) — portable schemas, named checks, and `excluded`
