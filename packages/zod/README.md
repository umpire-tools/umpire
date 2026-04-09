# @umpire/zod

Availability-aware Zod validation for [@umpire/core](https://www.npmjs.com/package/@umpire/core)-powered state. Disabled fields produce no validation errors. Required/optional follows Umpire's availability map.

[Docs](https://sdougbrown.github.io/umpire/examples/signup/) · [Quick Start](https://sdougbrown.github.io/umpire/learn/)

## Install

```bash
npm install @umpire/core @umpire/zod zod
```

`zod` is a peer dependency — bring your own version (v3 or v4).

## Usage

```ts
import { z } from 'zod'
import { umpire, enabledWhen, requires } from '@umpire/core'
import { activeSchema, activeErrors, zodErrors } from '@umpire/zod'

// 1. Define availability rules
const ump = umpire({
  fields: {
    email:       { required: true, isEmpty: (v) => !v },
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

const schema = activeSchema(availability, fieldSchemas, z)
const result = schema.safeParse(values)

if (!result.success) {
  const errors = activeErrors(availability, zodErrors(result.error))
  // errors.email → 'Enter a valid email' (only if email is enabled)
  // errors.companyName → undefined (disabled on personal plan)
}
```

## API

### `activeSchema(availability, schemas, z)`

Builds a `z.object()` from the availability map:
- **Disabled fields** are excluded entirely
- **Enabled + required** fields use the base schema
- **Enabled + optional** fields get `.optional()`

Pass per-field schemas directly, or use `formSchema.shape` to extract from an existing `z.object()`.

Throws if you accidentally pass a `z.object()` instead of its `.shape` — the error message tells you what to do.

### `activeErrors(availability, errors)`

Filters normalized field errors to only include enabled fields. Returns `Partial<Record<field, message>>`.

### `zodErrors(error)`

Normalizes a Zod error's `issues` array into `{ field, message }[]` pairs for use with `activeErrors`.

## Devtools

If you use `@umpire/devtools`, `@umpire/zod/devtools` can expose validation state in a tab. The most ergonomic path is to derive from the current devtools context:

```ts
import { useUmpireWithDevtools } from '@umpire/devtools/react'
import { zodValidationExtension } from '@umpire/zod/devtools'

const { check } = useUmpireWithDevtools('signup', ump, values, conditions, {
  extensions: [
    zodValidationExtension({
      resolve({ scorecard, values }) {
        const baseSchema = activeSchema(scorecard.check, fieldSchemas, z)
        const schema = baseSchema.refine(
          (data) => !data.confirmPassword || !data.password || data.confirmPassword === data.password,
          { message: 'Passwords do not match', path: ['confirmPassword'] },
        )

        return {
          result: schema.safeParse(values),
          schemaFields: Object.keys(baseSchema.shape),
        }
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
- the active error map after availability filtering
- optional active schema field names

It does not currently detect skipped `refine()`/`superRefine()` execution on its own. If we want that, we will likely need richer validation instrumentation than a plain `safeParse()` result exposes.

## The Render Loop

The payoff — one loop renders every field regardless of availability, validation, or fouls:

```tsx
{fields.map((field) => {
  const av = availability[field]
  const error = validationErrors[field]

  return (
    <div className={av.enabled ? '' : 'disabled'}>
      <input disabled={!av.enabled} value={values[field]} />
      {!av.enabled && <span>{av.reason}</span>}
      {av.enabled && error && <span className="error">{error}</span>}
    </div>
  )
})}
```

No per-field branching. No `if (field === 'companyName' && plan === 'business')`. The rules and schemas declare everything upfront. The render loop just reads.

## Docs

- [Signup Form + Zod demo](https://sdougbrown.github.io/umpire/examples/signup/) — live interactive example
- [Composing with Validation](https://sdougbrown.github.io/umpire/concepts/validation/) — patterns and boundary guide
- [Quick Start](https://sdougbrown.github.io/umpire/learn/) — learn each rule primitive
