# @umpire/zod

Availability-aware Zod validation for [@umpire/core](https://www.npmjs.com/package/@umpire/core)-powered state. Disabled fields produce no validation errors. Required/optional follows Umpire's availability map.

[Docs](https://umpire.tools/examples/signup/) · [Quick Start](https://umpire.tools/learn/)

## Install

```bash
npm install @umpire/core @umpire/zod zod
```

`zod` is a peer dependency — bring your own version (v3 or v4).

## Usage

```ts
import { z } from 'zod'
import { umpire, enabledWhen, requires } from '@umpire/core'
import {
  createZodAdapter,
  deriveErrors,
  deriveSchema,
  zodErrors,
} from '@umpire/zod'

// 1. Define availability rules
const ump = umpire({
  fields: {
    email: { required: true, isEmpty: (v) => !v },
    companyName: { required: true, isEmpty: (v) => !v },
  },
  rules: [
    enabledWhen('companyName', (_v, c) => c.plan === 'business', {
      reason: 'business plan required',
    }),
  ],
})

// 2. Define per-field Zod schemas
const fieldSchemas = {
  email: z.string().email('Enter a valid email'),
  companyName: z.string().min(1, 'Company name is required'),
}

// 3. Compose at render time
const availability = ump.check(values, { plan })

const schema = deriveSchema(availability, fieldSchemas)
const result = schema.safeParse(values)

if (!result.success) {
  const errors = deriveErrors(availability, zodErrors(result.error))
  // errors.email → 'Enter a valid email' (only if email is enabled)
  // errors.companyName → undefined (disabled on personal plan)
}

const validation = createZodAdapter({
  schemas: fieldSchemas,
})

const umpWithValidation = umpire({
  fields: {
    email: { required: true, isEmpty: (v) => !v },
    companyName: { required: true, isEmpty: (v) => !v },
  },
  rules: [
    enabledWhen('companyName', (_v, c) => c.plan === 'business', {
      reason: 'business plan required',
    }),
  ],
  validators: validation.validators,
})
```

## API

### `deriveSchema(availability, schemas)`

Builds a `z.object()` from the availability map:

- **Disabled fields** are excluded entirely
- **Enabled + required** fields use the base schema
- **Enabled + optional** fields get `.optional()`

Pass per-field schemas directly, or use `formSchema.shape` to extract from an existing `z.object()`.

Throws if you accidentally pass a `z.object()` instead of its `.shape` — the error message tells you what to do.

### `deriveErrors(availability, errors)`

Filters normalized field errors to only include enabled fields and keeps the first message per field. Returns `Partial<Record<field, message>>`.

### `zodErrors(error)`

Normalizes a Zod error's `issues` array into `{ field, message }[]` pairs for use with `deriveErrors`.

### `createZodAdapter({ schemas, build? })`

Creates a convenience adapter with:

- `validators` for `umpire({ validators })`, surfacing the first field-level Zod issue as `error`
- `run(availability, values)` for the full `deriveSchema() -> safeParse() -> deriveErrors()` flow

If you need every issue or deeper control, you can still use `deriveSchema()` and `safeParse()` directly.

### Blank strings and `isEmpty`

The generated validators follow Umpire's satisfaction semantics. By default,
only `null` and `undefined` count as empty. So if a string field does not define
`isEmpty`, a value like `''` is still considered satisfied and may surface
`valid: false` immediately.

For form-style inputs, define an explicit empty-state rule:

```ts
import { isEmptyString, umpire } from '@umpire/core'

const validation = createZodAdapter({
  schemas: {
    email: z.string().email('Enter a valid email'),
  },
})

const ump = umpire({
  fields: {
    email: { required: true, isEmpty: isEmptyString },
  },
  rules: [],
  validators: validation.validators,
})
```

That keeps blank strings out of the validation path until the field is
satisfied under your chosen emptiness semantics.

## Devtools

If you use `@umpire/devtools`, `@umpire/zod/devtools` can expose validation state in a tab. The most ergonomic path is to derive from the current devtools context:

```ts
import { useUmpireWithDevtools } from '@umpire/devtools/react'
import { zodValidationExtension } from '@umpire/zod/devtools'

const validation = createZodAdapter({
  schemas: fieldSchemas,
  build(baseSchema) {
    return baseSchema.refine(
      (data) =>
        !data.confirmPassword ||
        !data.password ||
        data.confirmPassword === data.password,
      { message: 'Passwords do not match', path: ['confirmPassword'] },
    )
  },
})

const { check } = useUmpireWithDevtools('signup', ump, values, conditions, {
  extensions: [
    zodValidationExtension({
      resolve({ scorecard, values }) {
        return validation.run(scorecard.check, values)
      },
    }),
  ],
})
```

If you already have a precomputed parse result, the helper also accepts `availability`, `result`, and optional `schemaFields` directly.

The first pass shows:

- valid/invalid
- surfaced error count
- suppressed and unmapped issue counts
- the derived error map after availability filtering
- optional derived schema field names

It does not currently detect skipped `refine()`/`superRefine()` execution on its own. If we want that, we will likely need richer validation instrumentation than a plain `safeParse()` result exposes.

## The Render Loop

The payoff — one loop renders every field regardless of availability, validation, or fouls:

```tsx
{
  fields.map((field) => {
    const av = availability[field]
    const error = validationErrors[field]

    return (
      <div className={av.enabled ? '' : 'disabled'}>
        <input disabled={!av.enabled} value={values[field]} />
        {!av.enabled && <span>{av.reason}</span>}
        {av.enabled && error && <span className="error">{error}</span>}
      </div>
    )
  })
}
```

No per-field branching. No `if (field === 'companyName' && plan === 'business')`. The rules and schemas declare everything upfront. The render loop just reads.

## Docs

- [Signup Form + Zod demo](https://umpire.tools/examples/signup/) — live interactive example
- [Composing with Validation](https://umpire.tools/concepts/validation/) — patterns and boundary guide
- [Quick Start](https://umpire.tools/learn/) — learn each rule primitive
