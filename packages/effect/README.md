# @umpire/effect

Availability-aware Effect Schema validation, SubscriptionRef bridge, Stream utilities, and Layer wiring for [@umpire/core](https://www.npmjs.com/package/@umpire/core)-powered state. `@umpire/effect` is Effect-first: use `runValidate(...)`, `runEffect(...)`, or manual `decodeEffectSchema(...)` inside `Effect.gen`. Disabled fields produce no validation errors. Required/optional follows Umpire's availability map.

[Docs](https://umpire.tools/adapters/validation/effect/) · [Quick Start](https://umpire.tools/learn/)

## Install

```bash
npm install @umpire/core @umpire/effect effect
```

`effect` is a peer dependency — bring your own Effect v4 beta/stable release.

## Usage

### Sync validation (schemas without service dependencies)

```ts
import { Schema } from 'effect'
import { enabledWhen, umpire } from '@umpire/core'
import {
  createEffectAdapter,
  decodeEffectSchemaSync,
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

// 2. Define per-field Effect schemas
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
const result = decodeEffectSchemaSync(schema, values)

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

### Effectful validation (schemas with service dependencies)

When your Effect schemas require services (e.g. a repository or external API), use `runEffect` and `runValidate` instead of the sync `run` / `validators`:

```ts
import { Effect, Schema } from 'effect'
import { createEffectAdapter } from '@umpire/effect'

// fieldSchemas can have service dependencies
const fieldSchemas = {
  username: Schema.String.pipe(
    Schema.filter((s: string) => s.length >= 3, { message: () => 'Too short' }),
  ),
  // This schema needs a UserRepo to check uniqueness
  email: Schema.String.pipe(
    Schema.filterEffect((s: string) =>
      Effect.gen(function* () {
        const repo = yield* UserRepo
        const exists = yield* repo.findByEmail(s)
        return !exists
      }),
    ),
    { message: () => 'Email already taken' },
  ),
}

const validation = createEffectAdapter()({ schemas: fieldSchemas })
// note: validation.validators and validation.run are NOT available here
// because the schemas have service dependencies (R ≠ never)

// Use runEffect for full result inspection
const program = Effect.gen(function* () {
  const result = yield* validation.runEffect(availability, values)
  if (result.result._tag === 'Left') {
    console.log(result.errors)
  }
  return result
})

// Or runValidate — succeeds with the parsed output, fails with UmpireValidationError
const program2 = validation
  .runValidate(availability, values)
  .pipe(
    Effect.catchTag('UmpireValidationError', (error) =>
      Effect.succeed({ errors: error.errors }),
    ),
  )

// Provide your services
Effect.runPromise(program.pipe(Effect.provideService(UserRepo, myRepo)))
```

## API

### `deriveSchema(availability, schemas, options?)`

Builds a `Schema.Struct` from the availability map:

- **Disabled fields** — excluded from the schema entirely
- **Enabled + required** — field uses the base schema as-is
- **Enabled + optional** — field is wrapped with `Schema.optional()`

`deriveSchema` **preserves the `R` parameter** from your field schemas. If any field schema requires a service, the returned struct schema requires it too.

For manual composition, build the availability-aware schema with `deriveSchema()`. Decode it with `decodeEffectSchema()` inside an Effect workflow. If the schema has no service requirement and you need a plain result, use `decodeEffectSchemaSync()`.

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

### `createEffectAdapter()({ schemas, build?, valueShape?, namespace?, rejectFoul? })`

Creates a convenience adapter that bundles the `deriveSchema → decode → deriveErrors` flow. The adapter provides different members depending on whether your schemas have service dependencies:

**When all schemas are context-free** (`R = never`):

- `validators` — per-field validators for `umpire({ validators })`, surfacing the first field-level parse issue as `error`
- `run(availability, values)` — full validation returning `{ errors, normalizedErrors, result, schemaFields }`

**Always available:**

- `runEffect(availability, values)` — effectful validation returning `Effect<EffectAdapterRunResult, never, R>`. Works with any `R`.
- `runValidate(availability, values)` — effectful validation returning `Effect<Out, UmpireValidationError, R>`. Succeeds with the parsed output, fails with an `UmpireValidationError` on validation failure. Works with any `R`.

When your schemas have service dependencies (`R ≠ never`), `validators` and `run` are **not available** on the adapter — use `runEffect` and `runValidate` instead.

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

// Sync use (schemas must be context-free)
const { errors } = validation.run(availability, values)

// Or effectful (any R)
const result = yield * validation.runEffect(availability, values)
```

For manual composition, build the availability-aware schema with `deriveSchema()`. Decode it with `decodeEffectSchema()` inside an Effect workflow. If the schema has no service requirement and you need a plain result, use `decodeEffectSchemaSync()`.

### `toAsyncWriteValidationAdapter(adapter, run)`

Adapts an Effect validation adapter to `@umpire/write`'s async validation protocol. Use this when serviceful Effect schemas need to participate in async write or Drizzle checks:

```ts
import { Effect } from 'effect'
import {
  createEffectAdapter,
  toAsyncWriteValidationAdapter,
} from '@umpire/effect'

const validation = createEffectAdapter()({ schemas })

const writeValidation = toAsyncWriteValidationAdapter(validation, (effect) =>
  Effect.runPromise(Effect.provide(effect, LiveLayer)),
)

await policy.checkCreateAsync(data, {
  validation: writeValidation,
})
```

The runner is supplied by your app so you control service provisioning. For context-free schemas, `Effect.runPromise` is enough.

### `UmpireValidationError`

A tagged error class thrown by `runValidate` on validation failure. Use `Effect.catchTag` to handle it:

```ts
import { UmpireValidationError } from '@umpire/effect'

validation.runValidate(availability, values).pipe(
  Effect.catchTag('UmpireValidationError', (error) => {
    console.log(error.message) // 'Validation failed: email, password'
    console.log(error.errors) // { email: 'Enter a valid email', password: undefined }
    console.log(error.normalizedErrors) // [{ field: 'email', message: '...' }]
    return Effect.succeed({ errors: error.errors })
  }),
)
```

`error.errors` is a `Record<string, string | undefined>` — one entry per field, `undefined` when that field passed validation.

### `decodeEffectSchema(schema, input, options?)`

Effect-first schema decoding. Use this in `Effect.gen` with the schema returned by `deriveSchema()`, including schemas with service dependencies (`R ≠ never`):

```ts
import { decodeEffectSchema, deriveSchema } from '@umpire/effect'

const schema = deriveSchema(availability, fieldSchemas)
// schema may carry R from field schemas with service dependencies

const program = Effect.gen(function* () {
  const result = yield* decodeEffectSchema(schema, values, {
    errors: 'all',
  })
  if (result._tag === 'Left') {
    // handle errors
  }
  return result
})
```

### `decodeEffectSchemaSync(schema, input, options?)`

Plain synchronous schema decoding for context-free schemas only. Use this only when you explicitly need a plain result and the schema has no Effect service requirement (`R = never`):

```ts
import { decodeEffectSchemaSync, deriveSchema } from '@umpire/effect'

const schema = deriveSchema(availability, fieldSchemas)
const result = decodeEffectSchemaSync(schema, values, { errors: 'all' })
```

`decodeEffectSchemaSync` cannot handle service-requiring schemas. Serviceful Effect schemas should use `decodeEffectSchema`, `runEffect`, or `runValidate`.

### `availabilityStream(ump, ref, options)`

Returns an Effect `Stream<AvailabilityMap<F>, never, never>` from a `SubscriptionRef`. Each time the ref changes, the stream emits a fresh availability map computed by `ump.check()`:

```ts
import { SubscriptionRef, Stream } from 'effect'
import { availabilityStream } from '@umpire/effect'

const stream = availabilityStream(ump, ref, {
  select: () => ({}),
  conditions: (state) => state,
})

// Collect all availability snapshots
const history = yield * Stream.runCollect(stream)
```

The first emission is a fresh check (no previous values). Subsequent emissions pass the previous values to `ump.check()` so rules that depend on prior state can diff.

### `availabilityStreamAsync(ump, ref, options)`

Same as `availabilityStream` but for `@umpire/async` instances. The stream's error channel is `unknown` because `@umpire/async` checks are promise-based and can reject:

```ts
import { availabilityStreamAsync } from '@umpire/effect'

const stream = availabilityStreamAsync(asyncUmp, ref, options)
// Stream<AvailabilityMap<F>, unknown, never>
```

If a check rejects, the stream fails with that error. Handle it with `Stream.catchAll` or `Stream.orElse`.

### `umpireLayer(tag, definition)`

Creates an Effect `Layer` that provides an `@umpire/core` `Umpire` instance as a service:

```ts
import { Context, Effect } from 'effect'
import { umpireLayer } from '@umpire/effect'
import { enabledWhen } from '@umpire/core'

class UmpireService extends Context.Tag('UmpireService')<
  UmpireService,
  ReturnType<typeof umpire>
>() {}

const layer = umpireLayer(UmpireService, {
  fields: { name: {}, email: {} },
  rules: [enabledWhen('email', (_v, c: { showEmail: boolean }) => c.showEmail)],
})

// Use it in your program
const program = Effect.gen(function* () {
  const ump = yield* UmpireService
  const availability = ump.check({ name: 'Jane' }, { showEmail: true })
  // ...
})

Effect.runPromise(program.pipe(Effect.provide(layer)))
```

### `umpireAsyncLayer(tag, definition)`

Same as `umpireLayer` but for `@umpire/async` instances:

```ts
import { umpireAsyncLayer } from '@umpire/effect'

const asyncLayer = umpireAsyncLayer(AsyncUmpireService, {
  fields: { name: {}, email: {} },
  rules: [enabledWhen('email', (_v, c: { showEmail: boolean }) => c.showEmail)],
})
```

### Sync-vs-effect boundary

Umpire's Effect package draws a clean line between sync and effectful APIs:

| API                                   | Requires `R = never`? | Handles service-requiring schemas? |
| ------------------------------------- | --------------------- | ---------------------------------- |
| `deriveSchema()`                      | No — preserves `R`    | Yes                                |
| `decodeEffectSchema()`                | No                    | Yes                                |
| `decodeEffectSchemaSync()`            | Yes                   | No                                 |
| `createEffectAdapter().validators`    | Yes                   | No                                 |
| `createEffectAdapter().run()`         | Yes                   | No                                 |
| `createEffectAdapter().runEffect()`   | No                    | Yes                                |
| `createEffectAdapter().runValidate()` | No                    | Yes                                |

`deriveSchema` itself preserves the `R` parameter from your field schemas. If a field schema requires a service (e.g. a repository for uniqueness checks), the struct schema returned by `deriveSchema` will require it too. You can feed that schema directly to `decodeEffectSchema`, `runEffect`, or `runValidate` — all of which support the full `R` channel.

The sync APIs (`decodeEffectSchemaSync`, `validators`, `run`) are available only when `R = never`. When you use a service-requiring schema, those members are not present on the adapter. You get a TypeScript error at the call site rather than a runtime failure.

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
