# @umpire/effect

Availability-aware Effect Schema validation and SubscriptionRef bridge for [@umpire/core](https://www.npmjs.com/package/@umpire/core)-powered state. Disabled fields produce no validation errors. Required/optional follows Umpire's availability map.

[Docs](https://umpire.tools/adapters/validation/effect/) · [Quick Start](https://umpire.tools/learn/)

## Install

```bash
npm install @umpire/core @umpire/effect effect
```

`effect` is a peer dependency — bring your own Effect v4 beta/stable release.

## Usage

```ts
import { Schema } from 'effect'
import { enabledWhen, umpire } from '@umpire/core'
import {
  createEffectAdapter,
  decodeEffectSchema,
  deriveErrors,
  deriveSchema,
  effectErrors,
} from '@umpire/effect'

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

// 2. Define per-field Effect schemas with no service/context dependencies
const fieldSchemas = {
  email: Schema.String.check(
    Schema.makeFilter((s) =>
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? undefined : 'Enter a valid email',
    ),
  ),
  companyName: Schema.String.check(
    Schema.makeFilter((s) =>
      s.length > 0 ? undefined : 'Company name is required',
    ),
  ),
}

// 3. Compose at render time
const availability = ump.check(values, { plan })

const schema = deriveSchema(availability, fieldSchemas)
const result = decodeEffectSchema(schema, values)

if (result._tag === 'Left') {
  const errors = deriveErrors(availability, effectErrors(result.error))
  // errors.email → 'Enter a valid email' (only if email is enabled)
  // errors.companyName → undefined (disabled on personal plan)
}

// Or use the convenience adapter
const validation = createEffectAdapter()({
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

### `deriveSchema(availability, schemas, options?)`

Builds a `Schema.Struct` from the availability map:

- **Disabled fields** are excluded entirely
- **Enabled + required** fields use the base schema
- **Enabled + optional** fields get `Schema.optional()`

Pass per-field schemas with no service/context dependencies.
Use `decodeEffectSchema()` for convenience, or call Effect v4's native `Schema.decodeUnknownResult()` directly.

#### `rejectFoul` option

Fields where `fair: false` hold values that were once valid but are now contextually wrong. By default these pass through with their base schema (useful on the client). On a **server**, you can reject them outright:

```ts
const schema = deriveSchema(availability, fieldSchemas, { rejectFoul: true })
```

When `rejectFoul: true`, a foul field with a present value fails with the field's `reason` as the error message. If the field is optional and absent, it passes.

### `effectErrors(parseError)`

Normalizes an Effect schema parse error or issue into `{ field, message }[]` pairs for use with `deriveErrors`.

### `deriveErrors(availability, errors)`

Filters normalized field errors to only include enabled fields and keeps the first message per field. Returns `Partial<Record<field, message>>`. Root-level errors (from cross-field refinements) are keyed under `'_root'`.

### `createEffectAdapter()({ schemas, build?, rejectFoul? })`

Creates a convenience adapter with:

- `validators` for `umpire({ validators })`, surfacing the first field-level parse issue as `error`
- `run(availability, values)` for the full `deriveSchema() → decode → deriveErrors()` flow, returning `{ errors, normalizedErrors, result, schemaFields }`

Use `build` to add cross-field refinements:

```ts
const validation = createEffectAdapter()({
  schemas: {
    password: Schema.String,
    confirmPassword: Schema.String,
  },
  build: (base) =>
    base.check(
      Schema.makeFilter((data) =>
        (data as Record<string, unknown>).password ===
        (data as Record<string, unknown>).confirmPassword
          ? undefined
          : 'Passwords do not match',
      ),
    ),
})
```

If you need every issue or deeper control, you can use `deriveSchema()` with either `decodeEffectSchema()` or Effect v4's native decode API.

### `fromSubscriptionRef(ump, ref, options)`

Bridges an Effect `SubscriptionRef<S>` to the `@umpire/store` contract. It runs a background fiber to track changes and interrupts it on `destroy()`.

```ts
import { Effect, SubscriptionRef } from 'effect'
import { enabledWhen, umpire } from '@umpire/core'
import { fromSubscriptionRef } from '@umpire/effect'

const ump = umpire({
  fields: { name: {}, email: {} },
  rules: [enabledWhen('email', (_v, c: { showEmail: boolean }) => c.showEmail)],
})

const ref = Effect.runSync(SubscriptionRef.make({ showEmail: false }))

const store = fromSubscriptionRef(ump, ref, {
  select: () => ({}),
  conditions: (state) => state,
})

store.field('email').enabled // false

await Effect.runPromise(SubscriptionRef.set(ref, { showEmail: true }))
store.field('email').enabled // true

store.destroy()
```

`select` and `conditions` follow the same contract as `@umpire/store`. See [Selection](https://umpire.tools/concepts/selection/) for patterns.

### Blank strings and `isEmpty`

The generated validators follow Umpire's satisfaction semantics. By default, only `null` and `undefined` count as empty. So if a string field does not define `isEmpty`, a value like `''` is still considered satisfied and may surface `valid: false` immediately.

For form-style inputs, define an explicit empty-state rule:

```ts
import { isEmptyString, umpire } from '@umpire/core'

const validation = createEffectAdapter()({
  schemas: {
    email: Schema.String.check(
      Schema.makeFilter((s) =>
        /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
          ? undefined
          : 'Enter a valid email',
      ),
    ),
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

That keeps blank strings out of the validation path until the field is satisfied under your chosen emptiness semantics.

## Docs

- [Effect Adapter](https://umpire.tools/adapters/validation/effect/) — full API reference
- [Validator Integrations](https://umpire.tools/adapters/validation/) — the general contract and how it extends to other libraries
- [Composing with Validation](https://umpire.tools/concepts/validation/) — patterns and boundary guide
- [Quick Start](https://umpire.tools/learn/) — learn each rule primitive
