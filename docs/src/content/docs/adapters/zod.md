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

### `activeSchema(availability, shape)`

Builds a `z.object()` from the availability map:

- **Disabled fields** — excluded from the schema entirely
- **Enabled + required** — field uses the base schema as-is
- **Enabled + optional** — field is wrapped with `.optional()`

```ts
import { z } from 'zod'
import { activeSchema } from '@umpire/zod'

const fieldSchemas = {
  email:       z.string().email('Enter a valid email'),
  companyName: z.string().min(1, 'Company name is required'),
  companySize: z.string().regex(/^\d+$/, 'Must be a number'),
}

const availability = ump.check(values, conditions)
const schema = activeSchema(availability, fieldSchemas)
const result = schema.safeParse(values)
```

**Pass the shape object, not a `z.object()`.** If you're working from an existing schema, extract its `.shape`:

```ts
const myFormSchema = z.object({
  email: z.string().email(),
  companyName: z.string().min(1),
})

// ✗ Wrong — activeSchema expects a shape, not a z.object()
activeSchema(availability, myFormSchema)

// ✓ Correct
activeSchema(availability, myFormSchema.shape)
```

`activeSchema` throws a descriptive error if it detects a Zod object was passed instead of its shape.

### `zodErrors(error)`

Normalizes a `ZodError` into `{ field, message }[]` pairs. Only the first error per field is kept.

```ts
const result = schema.safeParse(values)
if (!result.success) {
  const pairs = zodErrors(result.error)
  // [{ field: 'email', message: 'Enter a valid email' }, ...]
}
```

### `activeErrors(availability, errors)`

Filters normalized error pairs to only include enabled fields. Returns `Partial<Record<string, string>>`.

```ts
const errors = activeErrors(availability, zodErrors(result.error))
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
  validators: createZodValidation({
    schemas: { email: z.string().email('Enter a valid email') },
  }).validators,
})
```

That keeps blank strings in the "not yet validateable" lane until the field is
actually satisfied under your chosen emptiness rule.

## Chaining refinements

Cross-field refinements chain normally on the result of `activeSchema`:

```ts
const schema = activeSchema(availability, fieldSchemas)
  .refine(
    (data) => !data.confirmPassword || !data.password
      || data.confirmPassword === data.password,
    { message: 'Passwords do not match', path: ['confirmPassword'] },
  )
```

If `confirmPassword` is disabled, `activeSchema` excludes it and the refinement sees `undefined`. Guard against that — `!data.confirmPassword` in the predicate covers it.

## When to use the manual pattern instead

`@umpire/zod` handles the common case. If you need finer control — async validators, nested schemas, custom coercion, or `superRefine` — the manual intersection approach in [Composing with Validation](/umpire/concepts/validation/) gives you full flexibility.

## See also

- [Composing with Validation](/umpire/concepts/validation/) — conceptual boundary and manual patterns
- [Signup Form + Zod](/umpire/examples/signup/) — full walkthrough with `activeSchema`, the render loop, and foul handling
