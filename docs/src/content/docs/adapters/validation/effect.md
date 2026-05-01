---
title: '@umpire/effect'
description: Build availability-aware Effect schemas from an Umpire availability map, plus a SubscriptionRef bridge for reactive state.
---

`@umpire/effect` bridges Umpire's availability map and Effect's Schema system. Disabled fields are excluded from validation. Required/optional follows Umpire's output, not your schema definitions. It also provides `fromSubscriptionRef` for connecting an Effect `SubscriptionRef` to the `@umpire/store` reactive adapter.

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

`decodeEffectSchema()` returns a convenient `{ _tag: 'Right' | 'Left' }` result. If you call Effect directly, use Effect v4's native `Schema.decodeUnknownResult()` API.

Schemas must have no service/context dependencies.

#### `rejectFoul` option

Fields where `fair: false` hold values that were once valid but are now contextually wrong — a selection that no longer fits the current state. By default these pass through with their base schema (useful on the client where the user is still editing). On a **server**, you may want to reject them outright:

```ts
// Server handler — rejects any submission containing a foul value
const availability = engine.check(body)
const schema = deriveSchema(availability, fieldSchemas, { rejectFoul: true })
const result = decodeEffectSchema(schema, body)
```

When `rejectFoul: true`, a foul field with a present value fails with the field's `reason` as the error message. If the field is optional and absent, it passes — only submissions that *contain* a foul value are rejected.

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

### `createEffectAdapter({ schemas, build?, rejectFoul? })`

Convenience adapter that bundles the `deriveSchema → decode → deriveErrors` flow:

- `validators` — per-field validators for `umpire({ validators })`, surfacing the first parse issue as `error`
- `run(availability, values)` — full validation returning `{ errors, normalizedErrors, result, schemaFields }`

```ts
const validation = createEffectAdapter({
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

// Full derived-schema validation
const result = validation.run(availability, values)
if (result.result._tag === 'Left') {
  console.log(result.errors)       // { email: 'Enter a valid email' }
  console.log(result.schemaFields)  // ['email'] — disabled fields excluded
}
```

Use `build` to add cross-field refinements on the derived schema:

```ts
const validation = createEffectAdapter({
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

If you need every issue or deeper control, use `deriveSchema()` with either `decodeEffectSchema()` or Effect v4's native decode API.

## `fromSubscriptionRef()`

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

`select` and `conditions` follow the same contract as [`@umpire/store`](/umpire/adapters/store/). See [Selection](/umpire/concepts/selection/) for the full breakdown of patterns.

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
  validators: createEffectAdapter({
    schemas: { email: Schema.String },
  }).validators,
})
```

That keeps blank strings in the "not yet validateable" lane until the field is actually satisfied under your chosen emptiness rule.

## When to use the manual pattern instead

`@umpire/effect` handles the common case. If you need finer control — async validation, nested schemas, custom transformations, or custom error formatting — the manual intersection approach in [Composing with Validation](/umpire/concepts/validation/) gives you full flexibility.

## See also

- [Validator Integrations](/umpire/adapters/validation/) — the general contract and how it extends to other libraries
- [`@umpire/zod`](/umpire/adapters/validation/zod/) — the Zod equivalent of this adapter
- [`@umpire/store`](/umpire/adapters/store/) — the generic store adapter that `fromSubscriptionRef` delegates to
- [Composing with Validation](/umpire/concepts/validation/) — conceptual boundary and manual patterns
- [`fairWhen()`](/umpire/api/rules/fair-when/) — the rule that produces `fair: false`
