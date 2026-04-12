---
title: '@umpire/zod'
description: Build availability-aware Zod schemas from an Umpire availability map.
---

`@umpire/zod` bridges Umpire's availability map and Zod's schema system. Disabled fields are excluded from validation. Required/optional follows Umpire's output, not your schema definitions.

## Install

```bash
yarn add @umpire/core @umpire/zod zod
```

`zod` is a peer dependency — bring your own version (v3 or v4).

## API

### `deriveSchema(availability, shape, options?)`

Builds a `z.object()` from the availability map:

- **Disabled fields** — excluded from the schema entirely
- **Enabled + required** — field uses the base schema as-is
- **Enabled + optional** — field is wrapped with `.optional()`
- **Foul fields** — see `rejectFoul` below

```ts
import { z } from 'zod'
import { deriveSchema } from '@umpire/zod'

const fieldSchemas = {
  email:       z.string().email('Enter a valid email'),
  companyName: z.string().min(1, 'Company name is required'),
  companySize: z.string().regex(/^\d+$/, 'Must be a number'),
}

const availability = ump.check(values, conditions)
const schema = deriveSchema(availability, fieldSchemas)
const result = schema.safeParse(values)
```

**Pass the shape object, not a `z.object()`.** If you're working from an existing schema, extract its `.shape`:

```ts
const myFormSchema = z.object({
  email: z.string().email(),
  companyName: z.string().min(1),
})

// ✗ Wrong — deriveSchema expects a shape, not a z.object()
deriveSchema(availability, myFormSchema)

// ✓ Correct
deriveSchema(availability, myFormSchema.shape)
```

`deriveSchema` throws a descriptive error if it detects a Zod object was passed instead of its shape.

#### `rejectFoul` option

Fields where `fair: false` hold values that were once valid but are now contextually wrong — a selection that no longer fits the current state. By default these pass through with their base schema (useful on the client where the user is still editing). On a **server**, you may want to reject them outright:

```ts
// Server handler — rejects any submission containing a foul value
const availability = engine.check(body)
const schema = deriveSchema(availability, fieldSchemas, { rejectFoul: true })
const result = schema.safeParse(body)
```

When `rejectFoul: true`, a foul field with a present value fails with the field's `reason` as the Zod issue message. If the field is optional and absent, it passes — only submissions that *contain* a foul value are rejected.

### `zodErrors(error)`

Normalizes a `ZodError` into `{ field, message }[]` pairs.

```ts
const result = schema.safeParse(values)
if (!result.success) {
  const pairs = zodErrors(result.error)
  // [{ field: 'email', message: 'Enter a valid email' }, ...]
}
```

### `deriveErrors(availability, errors)`

Filters normalized error pairs to only include enabled fields and keeps the first message per field. Returns `Partial<Record<string, string>>`.

```ts
const errors = deriveErrors(availability, zodErrors(result.error))
// { email: 'Enter a valid email' }
// companyName omitted if disabled on the current plan
```

## Blank strings and `isEmpty`

`@umpire/zod` follows Umpire's satisfaction rules. By default, only `null` and
`undefined` count as empty. So if a field does not define `isEmpty`, an empty
string is still considered satisfied and can surface `valid: false` from
`validators` immediately.

For form-style string inputs, use an explicit empty-state helper:

```ts
import { isEmptyString, umpire } from '@umpire/core'

const ump = umpire({
  fields: {
    email: { required: true, isEmpty: isEmptyString },
  },
  rules: [],
  validators: createZodAdapter({
    schemas: { email: z.string().email('Enter a valid email') },
  }).validators,
})
```

That keeps blank strings in the "not yet validateable" lane until the field is
actually satisfied under your chosen emptiness rule.

## Chaining refinements

Cross-field refinements chain normally on the result of `deriveSchema`:

```ts
const schema = deriveSchema(availability, fieldSchemas)
  .refine(
    (data) => !data.confirmPassword || !data.password
      || data.confirmPassword === data.password,
    { message: 'Passwords do not match', path: ['confirmPassword'] },
  )
```

If `confirmPassword` is disabled, `deriveSchema` excludes it and the refinement sees `undefined`. Guard against that — `!data.confirmPassword` in the predicate covers it.

## When to use the manual pattern instead

`@umpire/zod` handles the common case. If you need finer control — async validators, nested schemas, custom coercion, or `superRefine` — the manual intersection approach in [Composing with Validation](/umpire/concepts/validation/) gives you full flexibility.

## See also

- [Validator Integrations](/umpire/adapters/validation/) — the general contract and how it extends to other libraries
- [Composing with Validation](/umpire/concepts/validation/) — conceptual boundary and manual patterns
- [Signup Form + Zod](/umpire/examples/signup/) — full walkthrough with `deriveSchema`, the render loop, and foul handling
