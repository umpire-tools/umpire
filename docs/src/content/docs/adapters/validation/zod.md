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

`@umpire/zod` handles the common case. If you need finer control — async validators, nested schemas, custom coercion, or `superRefine` — the manual intersection approach in [Composing with Validation](/concepts/validation/) gives you full flexibility.

## Discriminated Unions

If you have an existing Zod discriminated union that models mutually-exclusive field groups, you can derive an umpire `oneOf` rule from it directly. This is a compatibility path — umpire's native [`oneOf`](/api/rules/one-of/) gives you the same structure without the schema coupling. But if your validation layer already defines the groups via `z.discriminatedUnion`, there is no reason to duplicate that definition.

Take this payment method schema as the running example:

```ts
const paymentSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('card'),
    cardNumber: z.string(),
    cvv: z.string(),
  }),
  z.object({
    method: z.literal('bank'),
    routingNumber: z.string(),
    accountNumber: z.string(),
  }),
])
```

### `deriveOneOf(schema, options)`

Derives a `oneOf` Rule from a `z.discriminatedUnion`. You supply your own field definitions — this only produces the rule.

```ts
deriveOneOf(
  schema: z.ZodDiscriminatedUnion,
  options: DeriveOptions,
): Rule
```

```ts
import { deriveOneOf } from '@umpire/zod'
import { umpire } from '@umpire/core'

const ump = umpire({
  fields: {
    method:        { required: true },
    cardNumber:    { required: true },
    cvv:           { required: true },
    routingNumber: { required: true },
    accountNumber: { required: true },
  },
  rules: [
    deriveOneOf(paymentSchema, { groupName: 'paymentMethod' }),
  ],
})
```

`activeBranch` is wired automatically: it reads the discriminator field from state and returns the active branch name. When the discriminator holds `'card'`, the `bank` branch fields are disabled; when it holds `'bank'`, the `card` branch fields are disabled.

### `deriveDiscriminatedFields(schema, options)`

Derives both the field definitions and the `oneOf` rule together. Use this when you do not already have field definitions and want the schema to be the source of truth.

```ts
deriveDiscriminatedFields(
  schema: z.ZodDiscriminatedUnion,
  options: DeriveOptions & { required?: boolean },
): { fields: Record<string, FieldDef>, rule: Rule }
```

```ts
import { deriveDiscriminatedFields } from '@umpire/zod'
import { umpire } from '@umpire/core'

const { fields, rule } = deriveDiscriminatedFields(paymentSchema, {
  groupName: 'paymentMethod',
})

const ump = umpire({ fields, rules: [rule] })
```

`required` inference follows Zod's optionality: non-optional Zod fields become `required: true`, optional fields become `required: false`. Pass `required: true` to override this and mark all non-discriminator fields as required regardless of Zod optionality.

The discriminator field (`method` in this example) is always `required: true` in the derived field definitions. It is not included in any branch array — branches contain only the variant-specific fields.

### `DeriveOptions`

```ts
type DeriveOptions = {
  groupName: string               // name for the oneOf group
  exclude?: string[]              // fields to omit from branch arrays and field definitions
  branchNames?: Record<string, string>  // remap Zod literal values to branch names
}
```

`branchNames` is useful when your Zod literal values are not valid or readable umpire branch names. The state holds the raw literal value; `activeBranch` translates it to the mapped branch name at runtime.

```ts
deriveOneOf(paymentSchema, {
  groupName: 'paymentMethod',
  branchNames: { card: 'creditCard', bank: 'bankTransfer' },
})
```

With this mapping, umpire branches are named `creditCard` and `bankTransfer`, but the discriminator field in state still holds `'card'` or `'bank'`.

### Compatibility

Both functions work with Zod v3 and v4. The literal value is read from `._def.value` (v3) or `.value` (v4) — whichever is present.

`oneOf` throws at config time if any field appears in more than one branch. This mirrors the expectation from `z.discriminatedUnion` that variant shapes are non-overlapping (the discriminator field is excluded from this check).

## See also

- [`oneOf`](/api/rules/one-of/) — the native rule for mutually-exclusive field groups
- [Validator Integrations](/adapters/validation/) — the general contract and how it extends to other libraries
- [Composing with Validation](/concepts/validation/) — conceptual boundary and manual patterns
- [Signup Form + Zod](/examples/signup/) — full walkthrough with `deriveSchema`, the render loop, and foul handling
