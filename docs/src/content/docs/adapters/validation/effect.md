---
title: '@umpire/effect'
description: Build availability-aware Effect schemas from an Umpire availability map, plus a SubscriptionRef bridge for reactive state.
---

`@umpire/effect` bridges Umpire's availability map and Effect's Schema system. Disabled fields are excluded from validation. Required/optional follows Umpire's output, not your schema definitions. It provides two validation paths — sync APIs for context-free schemas and effectful APIs for schemas that require services. It also offers a `SubscriptionRef` bridge, reactive `Stream` generators, and `Layer` constructors for wiring Umpire into the Effect service environment.

## Install

```bash
yarn add @umpire/core @umpire/effect effect
```

`effect` is a peer dependency — bring your own Effect v4 beta/stable release.

## API

### `deriveSchema(availability, schemas, options?)`

Builds a `Schema.Struct` from the availability map:

- **Disabled fields** — excluded from the schema entirely
- **Enabled + required** — field uses the base schema as-is
- **Enabled + optional** — field is wrapped with `Schema.optional()`
- **Foul fields** — see `rejectFoul` below

```ts
import { Schema } from 'effect'
import {
  decodeEffectSchema,
  deriveSchema,
} from '@umpire/effect'

const fieldSchemas = {
  email: Schema.String.check(
    Schema.makeFilter((s) =>
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
        ? undefined
        : 'Enter a valid email',
    ),
  ),
  companyName: Schema.String.check(
    Schema.makeFilter((s) =>
      s.length > 0 ? undefined : 'Company name is required',
    ),
  ),
  companySize: Schema.String,
}

const availability = ump.check(values, conditions)
const schema = deriveSchema(availability, fieldSchemas)
const result = decodeEffectSchema(schema, values)
```

`deriveSchema` **preserves the `R` parameter** from your field schemas. If any field schema requires a service, the returned struct schema carries that requirement. Use `decodeEffectSchema()` to decode it synchronously (requires `R = never`), or `decodeEffectSchemaEffect()` to decode it with full service support.

`decodeEffectSchema()` returns a convenient `{ _tag: 'Right' | 'Left' }` result. If you call Effect directly, use Effect v4's native `Schema.decodeUnknownResult()` API.

#### `rejectFoul` option

Fields where `fair: false` hold values that were once valid but are now contextually wrong — a selection that no longer fits the current state. By default these pass through with their base schema (useful on the client where the user is still editing). On a **server**, you may want to reject them outright:

```ts
// Server handler — rejects any submission containing a foul value
const availability = engine.check(body)
const schema = deriveSchema(availability, fieldSchemas, { rejectFoul: true })
const result = decodeEffectSchema(schema, body)
```

When `rejectFoul: true`, a foul field with a present value fails with the field's `reason` as the error message. If the field is optional and absent, it passes — only submissions that *contain* a foul value are rejected.

### `decodeEffectSchemaEffect(schema, input, options?)`

The effectful variant of `decodeEffectSchema`. Use this when your schema has service dependencies (`R ≠ never`):

```ts
import { Effect } from 'effect'
import { decodeEffectSchemaEffect, deriveSchema } from '@umpire/effect'

const schema = deriveSchema(availability, fieldSchemas)
// schema may carry R from field schemas with service dependencies

const program = Effect.gen(function* () {
  const result = yield* decodeEffectSchemaEffect(schema, values, { errors: 'all' })
  if (result._tag === 'Left') {
    // handle errors
  }
  return result
})
```

The sync `decodeEffectSchema` requires `R = never` — it cannot handle service-requiring schemas. `decodeEffectSchemaEffect` supports the full Effect Schema `R` channel.

### `effectErrors(parseError)`

Normalizes an Effect schema parse error or issue into `{ field, message }[]` pairs.

```ts
const result = decodeEffectSchema(schema, values)
if (result._tag === 'Left') {
  const pairs = effectErrors(result.error)
  // [{ field: 'email', message: 'Enter a valid email' }, ...]
}
```

### `deriveErrors(availability, errors)`

Filters normalized error pairs to only include enabled fields and keeps the first message per field. Returns `Partial<Record<string, string>>`. Root-level errors from cross-field refinements are keyed under `'_root'`.

```ts
const errors = deriveErrors(availability, effectErrors(result.error))
// { email: 'Enter a valid email' }
// companyName omitted if disabled on the current plan
```

### `createEffectAdapter()({ schemas, build?, valueShape?, namespace?, rejectFoul? })`

Convenience adapter that bundles the `deriveSchema → decode → deriveErrors` flow. The adapter provides different members depending on whether your schemas have service dependencies.

**When all schemas are context-free** (`R = never`):
- `validators` — per-field validators for `umpire({ validators })`, surfacing the first parse issue as `error`
- `run(availability, values)` — full validation returning `{ errors, normalizedErrors, result, schemaFields }`

**Always available:**
- `runEffect(availability, values)` — returns `Effect<EffectAdapterRunResult, never, R>`. Works with any `R`.
- `runValidate(availability, values)` — returns `Effect<Out, UmpireValidationError, R>`. Succeeds with the parsed output, fails with `UmpireValidationError` on failure. Works with any `R`.

When your schemas have service dependencies (`R ≠ never`), `validators` and `run` are **not present** on the returned adapter. You get a TypeScript error at the call site. Use `runEffect` or `runValidate` instead.

#### Sync example (context-free schemas)

```ts
const validation = createEffectAdapter()({
  schemas: {
    email:       Schema.String,
    companyName: Schema.String,
  },
})

// Per-field validators for inline validation
const ump = umpire({
  fields,
  rules,
  validators: validation.validators,
})

// Full derived-schema validation (sync)
const result = validation.run(availability, values)
if (result.result._tag === 'Left') {
  console.log(result.errors)       // { email: 'Enter a valid email' }
  console.log(result.schemaFields)  // ['email'] — disabled fields excluded
}
```

#### Effectful example (service-requiring schemas)

```ts
import { Effect, Schema } from 'effect'
import { createEffectAdapter, UmpireValidationError } from '@umpire/effect'

const fieldSchemas = {
  username: Schema.String,
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
// validation.validators — not available (R ≠ never)
// validation.run — not available (R ≠ never)

// Use the effectful methods instead
const program = validation.runValidate(availability, values).pipe(
  Effect.catchTag('UmpireValidationError', (error) =>
    Effect.succeed({ errors: error.errors }),
  ),
)

Effect.runPromise(program.pipe(Effect.provideService(UserRepo, myRepo)))
```

#### Build option

Use `build` to add cross-field refinements on the derived schema:

```ts
const validation = createEffectAdapter()({
  schemas: {
    password:        Schema.String,
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

The root-level refinement error surfaces under `result.errors._root`.

If you need every issue or deeper control, use `deriveSchema()` with either `decodeEffectSchema()` (sync) or `decodeEffectSchemaEffect()` (effectful).

#### Nested value shape

When field keys are namespaced with a separator — for example `account.email` and `account.name` from Drizzle models — the flat key-value record does not match the nested object structure a schema expects. Set `valueShape: 'nested'` to restructure values before validation:

```ts
import { createEffectAdapter } from '@umpire/effect'
import { Schema } from 'effect'

const adapter = createEffectAdapter()({
  schemas: {
    'account.email': Schema.String,
    'account.name':  Schema.String,
  },
  valueShape: 'nested',           // default: 'flat'
  namespace: { separator: '.' },  // default separator: '.'
  build: (base) =>
    Schema.Struct({
      account: Schema.Struct({
        email: Schema.String,
        name:  Schema.String,
      }),
    }),
})
```

When `valueShape` is `'nested'`:

1. The flat candidate `{ 'account.email': 'x', 'account.name': 'y' }` is nested into `{ account: { email: 'x', name: 'y' } }` via `nestNamespacedValues` from `@umpire/write`.
2. The nested object is validated against the schema (after `build` transforms the derived base schema).
3. Error paths are flattened back to flat field keys via `flattenFieldErrorPaths`.

**`build` is required** when `valueShape` is `'nested'`. The derived per-field schema uses flat field keys (e.g. `'account.email'`), but validation runs against a nested object. The `build` callback is where you create a schema that matches that nested structure. Without it, the adapter throws a configuration error.

`namespace.separator` controls which character splits field names into path segments and defaults to `'.'`.

### `UmpireValidationError`

A tagged error class thrown by `runValidate` on validation failure. It carries the structured error information from the failed validation run:

```ts
import { Data } from 'effect'
import type { NormalizedFieldError } from '@umpire/effect'

// The shape
class UmpireValidationError extends Data.TaggedError('UmpireValidationError')<{
  readonly errors: Record<string, string | undefined>
  readonly message: string
  readonly normalizedErrors: NormalizedFieldError[]
}>
```

Use `Effect.catchTag` to handle it:

```ts
validation.runValidate(availability, values).pipe(
  Effect.catchTag('UmpireValidationError', (error) => {
    console.log(error.message)           // 'Validation failed: email, password'
    console.log(error.errors)             // { email: 'Enter a valid email', password: undefined }
    console.log(error.normalizedErrors)   // [{ field: 'email', message: '...' }, ...]
    return Effect.succeed({ errors: error.errors })
  }),
)
```

`error.errors` is a `Record<string, string | undefined>` — one entry per field. A field that passed validation has `undefined` as its value. Only fields with errors get message strings.

### `availabilityStream(ump, ref, options)`

Returns an Effect `Stream<AvailabilityMap<F>, never, never>` from a `SubscriptionRef`. Each time the ref changes, the stream emits a fresh availability map computed by `ump.check()`. The stream's error channel is `never` because `@umpire/core` checks are synchronous and never reject.

```ts
import { Effect, Stream, SubscriptionRef } from 'effect'
import { enabledWhen, umpire } from '@umpire/core'
import { availabilityStream } from '@umpire/effect'

const ump = umpire({
  fields: { name: {}, email: {} },
  rules: [enabledWhen('email', (_v, c: { showEmail: boolean }) => c.showEmail)],
})

const ref = Effect.runSync(SubscriptionRef.make({ showEmail: false }))

const stream = availabilityStream(ump, ref, {
  select: () => ({}),
  conditions: (state) => state,
})

// The first emission is a fresh check (no previous values).
// Subsequent emissions use the previous values for diff-aware rules.
const history = Effect.runSync(Stream.runCollect(stream.pipe(Stream.take(2))))
// history has 2 availability snapshots: [initial, after-first-change]
```

The `select` and `conditions` options follow the same contract as `@umpire/store`. See [Selection](/concepts/selection/).

### `availabilityStreamAsync(ump, ref, options)`

Same as `availabilityStream` but for `@umpire/async` instances. The stream's error channel is `unknown` because `@umpire/async` checks are promise-based and can reject:

```ts
import { availabilityStreamAsync } from '@umpire/effect'
import { umpire as asyncUmpire } from '@umpire/async'

const asyncUmp = asyncUmpire({
  fields: { name: {}, email: {} },
  rules: [enabledWhen('email', (_v, c: { showEmail: boolean }) => c.showEmail)],
})

const stream = availabilityStreamAsync(asyncUmp, ref, {
  select: () => ({}),
  conditions: (state) => state,
})
// Stream<AvailabilityMap<F>, unknown, never>
```

If a check rejects, the stream fails with that error. Handle it with `Stream.catchAll` or `Stream.orElse`.

### `umpireLayer(tag, definition)`

Creates an Effect `Layer` that provides an `@umpire/core` `Umpire` instance as a service. Use this to wire Umpire into your Effect service environment for dependency injection:

```ts
import { Context, Effect, Layer } from 'effect'
import { enabledWhen } from '@umpire/core'
import { umpireLayer } from '@umpire/effect'

class UmpireService extends Context.Tag('UmpireService')<
  UmpireService,
  ReturnType<typeof umpire>
>() {}

const layer = umpireLayer(UmpireService, {
  fields: { name: {}, email: {} },
  rules: [
    enabledWhen('email', (_v, c: { showEmail: boolean }) => c.showEmail),
  ],
})

const program = Effect.gen(function* () {
  const ump = yield* UmpireService
  const availability = ump.check({ name: 'Jane' }, { showEmail: true })
  // ...
})

Effect.runPromise(program.pipe(Effect.provide(layer)))
```

The layer is built with `Layer.sync` — the Umpire instance is constructed eagerly when the layer is provided.

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

`@umpire/effect` draws a clean line between sync and effectful APIs. This table summarizes which APIs handle service-requiring Effect schemas:

| API | Requires `R = never`? | Handles service-requiring schemas? |
|---|---|---|
| `deriveSchema()` | No — preserves `R` | Yes |
| `decodeEffectSchema()` | Yes | No |
| `decodeEffectSchemaEffect()` | No | Yes |
| `createEffectAdapter().validators` | Yes | No |
| `createEffectAdapter().run()` | Yes | No |
| `createEffectAdapter().runEffect()` | No | Yes |
| `createEffectAdapter().runValidate()` | No | Yes |
| `availabilityStream()` | N/A (no schemas) | N/A |
| `availabilityStreamAsync()` | N/A (no schemas) | N/A |
| `umpireLayer()` / `umpireAsyncLayer()` | N/A (no schemas) | N/A |

`deriveSchema` itself preserves the `R` parameter from your field schemas. If a field schema requires a service (e.g. a repository for uniqueness checks), the struct schema returned by `deriveSchema` will require it too. You can feed that schema directly to `decodeEffectSchemaEffect`, `runEffect`, or `runValidate` — all of which support the full `R` channel.

The sync APIs (`decodeEffectSchema`, `validators`, `run`) are available only when all schemas are context-free. When you use a service-requiring schema, those members are not present on the adapter — you get a TypeScript error at the call site rather than a runtime failure.

### `fromSubscriptionRef()`

Bridges an Effect `SubscriptionRef<S>` to the `@umpire/store` contract. It runs a background fiber to track changes and interrupts it on `destroy()`.

```ts
function fromSubscriptionRef<
  S,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  ref: SubscriptionRef.SubscriptionRef<S>,
  options: FromStoreOptions<S, C>,
): UmpireStore<F>
```

### Example

```ts
import { Effect, SubscriptionRef } from 'effect'
import { enabledWhen, umpire } from '@umpire/core'
import { fromSubscriptionRef } from '@umpire/effect'

const ump = umpire({
  fields: { name: {}, email: {} },
  rules: [
    enabledWhen('email', (_v, c: { showEmail: boolean }) => c.showEmail),
  ],
})

const ref = Effect.runSync(SubscriptionRef.make({ showEmail: false }))

const store = fromSubscriptionRef(ump, ref, {
  select: () => ({}),
  conditions: (state) => state,
})

store.field('email').enabled // false

// Update the ref — availability recomputes automatically
await Effect.runPromise(SubscriptionRef.set(ref, { showEmail: true }))
store.field('email').enabled // true

store.destroy() // interrupts the background fiber
```

`select` and `conditions` follow the same contract as [`@umpire/store`](/adapters/store/). See [Selection](/concepts/selection/) for the full breakdown of patterns.

The returned `UmpireStore` surface is the same as all store adapters: `field(name)`, `fouls`, `getAvailability()`, `subscribe(listener)`, and `destroy()`.

## Blank strings and `isEmpty`

`@umpire/effect` follows Umpire's satisfaction rules. By default, only `null` and `undefined` count as empty. So if a field does not define `isEmpty`, an empty string is still considered satisfied and can surface `valid: false` from `validators` immediately.

For form-style string inputs, use an explicit empty-state helper:

```ts
import { isEmptyString, umpire } from '@umpire/core'

const ump = umpire({
  fields: {
    email: { required: true, isEmpty: isEmptyString },
  },
  rules: [],
  validators: createEffectAdapter()({
    schemas: { email: Schema.String },
  }).validators,
})
```

That keeps blank strings in the "not yet validateable" lane until the field is actually satisfied under your chosen emptiness rule.

## When to use the manual pattern instead

`@umpire/effect` handles the common case — both sync and effectful. If you need finer control — custom transformations, custom error formatting, or patterns the adapter doesn't cover — the manual approach in [Composing with Validation](/concepts/validation/) using `deriveSchema` directly gives you full flexibility.

If you're unsure which decode variant to use: reach for `decodeEffectSchemaEffect` when your schema has service dependencies, and `decodeEffectSchema` when it doesn't. The `createEffectAdapter` surfaces the right methods for your schema context automatically.

## See also

- [Validator Integrations](/adapters/validation/) — the general contract and how it extends to other libraries
- [`@umpire/zod`](/adapters/validation/zod/) — the Zod equivalent of this adapter
- [`@umpire/store`](/adapters/store/) — the generic store adapter that `fromSubscriptionRef` delegates to
- [Composing with Validation](/concepts/validation/) — conceptual boundary and manual patterns
- [`fairWhen()`](/api/rules/fair-when/) — the rule that produces `fair: false`
