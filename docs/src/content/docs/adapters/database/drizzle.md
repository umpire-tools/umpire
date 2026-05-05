---
title: '@umpire/drizzle'
description: Derive Umpire fields from Drizzle ORM table definitions and reuse @umpire/write at the service boundary.
---

When your server-side state is modeled in Drizzle, `@umpire/drizzle` gives you
the fastest way to start an Umpire policy from real schema metadata.

It reads Drizzle column metadata once at setup time, derives an Umpire `fields`
object, and lets you focus on the part that matters most: cross-field business
rules like "companyName is required for business accounts." The result is less
duplicated config, fewer drift bugs between schema and policy, and clearer
service-layer checks before persistence.

## Install

```bash
yarn add @umpire/core @umpire/write @umpire/drizzle drizzle-orm
```

`drizzle-orm` is a peer dependency. This RC targets Drizzle `1.0.0-rc.1` and
newer 1.x releases.

The ESLint plugin ships an opt-in [`no-write-owned-fields`](/extensions/eslint-plugin/#no-write-owned-fields) rule that catches database-owned fields leaking into write candidates at lint time — catching these before they reach `checkDrizzleCreate` or `checkDrizzlePatch` at runtime.

## Example

```ts
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { checkCreate } from '@umpire/write'
import { fromDrizzleTable } from '@umpire/drizzle'

const users = pgTable('users', {
  id: serial().primaryKey(),
  email: varchar({ length: 255 }).notNull(),
  accountType: text({ enum: ['personal', 'business'] })
    .notNull()
    .default('personal'),
  companyName: text(),
})

const base = fromDrizzleTable(users)

export const userUmp = umpire({
  fields: base.fields,
  rules: [
    ...base.rules,
    enabledWhen('companyName', (values) => values.accountType === 'business'),
    requires('companyName', (values) => values.accountType === 'business'),
  ],
})

const result = checkCreate(userUmp, {
  email: 'alex@example.com',
  accountType: 'business',
})

if (!result.ok) {
  throw new Error(result.errors.join(', '))
}
```

## `fromDrizzleTable(table, options?)`

The adapter uses Drizzle's public `getColumns()` helper. It does not need a
database connection and does not inspect migrations.

```ts
function fromDrizzleTable<T extends Table, const O extends FromDrizzleTableOptions = {}>(
  table: T,
  options?: O,
): FromDrizzleTableResult<FromDrizzleTableFields<T, O>>
```

```ts
const { fields, rules } = fromDrizzleTable(users, {
  exclude: ['createdAt', 'updatedAt'],
  required: {
    companyName: true,
  },
  isEmpty: {
    companyName: 'string',
  },
})
```

`rules` is currently empty. Drizzle knows column shape; it does not know your
business availability policy.

### `FromDrizzleTableOptions`

```ts
type FromDrizzleTableOptions = {
  exclude?: readonly string[]       // omit columns by TypeScript property name
  isEmpty?: Record<string, DrizzleIsEmptyStrategy | NonNullable<FieldDef['isEmpty']>>
  required?: Record<string, boolean>  // override requiredness from Drizzle metadata
}
```

- `exclude` omits columns by their TypeScript property name, not the database
  column name. If your Drizzle column is `text('display_name')`, exclude it as
  `displayName`.
- `isEmpty` overrides a field's satisfaction strategy. Accepts a built-in
  strategy name or a custom `(value) => boolean` function.
- `required` overrides requiredness derived from Drizzle's `notNull` and
  default metadata.

Built-in `isEmpty` strategies are `'present'`, `'string'`, `'number'`,
`'bigint'`, `'boolean'`, `'array'`, and `'object'`.

### `FromDrizzleTableResult`

```ts
type FromDrizzleTableResult<F extends Record<string, FieldDef> = Record<string, FieldDef>> = {
  fields: F
  rules: Rule<F>[]
}
```

Spread `base.fields` and `base.rules` into your `umpire()` call, then add your
own rules. The `rules` array is empty today but is part of the return type so
future Drizzle-derived rules can be added without a breaking change.

## `fromDrizzleModel(model)`

Use `fromDrizzleModel()` when one domain policy spans several tables. It runs
`fromDrizzleTable()` for each table, namespaces the fields, and returns one flat
Umpire field map.

```ts
import { enabledWhen, umpire } from '@umpire/core'
import { fromDrizzleModel } from '@umpire/drizzle'

const accountModel = fromDrizzleModel({
  account: accounts,
  profile: profiles,
  billing: {
    table: billingProfiles,
    exclude: ['createdAt', 'updatedAt'],
  },
})

export const accountUmp = umpire({
  fields: accountModel.fields,
  rules: [
    enabledWhen(accountModel.field('billing', 'taxId'), (values) => {
      return values[accountModel.name('account', 'accountType')] === 'business'
    }),
  ],
})
```

The generated keys are strings such as `account.email`,
`profile.displayName`, and `billing.taxId`. Umpire still treats fields as a flat
record; the namespace is an adapter-level convention that avoids collisions
between common column names like `id`, `status`, or `createdAt`.

Each model entry can be a table directly or an object with table-specific
options:

```ts
const model = fromDrizzleModel({
  account: accounts,
  billing: {
    table: billingProfiles,
    exclude: ['createdAt'],
    required: {
      taxId: true,
    },
  },
})
```

`model.name(namespace, field)` returns the namespaced field name.
`model.field(namespace, field)` returns a named Umpire field ref for rule
helpers like `enabledWhen()`, `requires()`, and `fairWhen()`.

## Column Mapping

Primary keys and generated columns are excluded by default. Everything else is
mapped conservatively:

| Drizzle metadata | Umpire result |
| --- | --- |
| `notNull` with no default/runtime default | `required: true` |
| `hasDefault`, `$defaultFn()`, `$onUpdate()` | `required: false` |
| static string/number/boolean/null default | copied to `field.default` |
| SQL/runtime/generated default | not copied |
| enum columns | presence-based satisfaction |
| string columns | blank strings are unsatisfied |
| number/bigint/boolean columns | wrong primitive type is unsatisfied |
| JSON object columns | empty objects are unsatisfied |
| date/time columns | presence-based satisfaction |

Field keys use your TypeScript property names, not database column names. A
Drizzle column defined as `text('display_name')` appears as `displayName` in the
derived fields.

## Write Checks

`fromDrizzleTable` already removes primary keys and generated columns from the Umpire field map, so they never participate in policy evaluation. At runtime, if one of those columns appears in `req.body` anyway, the Drizzle-aware checks reject it by default — that's what `nonWritableKeys: 'reject'` enforces. For earlier feedback, the ESLint plugin's [`no-write-owned-fields`](/extensions/eslint-plugin/#no-write-owned-fields) rule flags the same problem at lint time, before the code runs.

Use `checkCreate` and `checkPatch` from `@umpire/write` to check availability policy against any Umpire instance:

```ts
import { checkCreate } from '@umpire/write'

const result = checkCreate(userUmp, req.body)
if (!result.ok) {
  return Response.json(
    { errors: result.errors },
    { status: 422 },
  )
}
```

These work with any Umpire instance and check pure availability policy — they do not handle column shaping, unknown keys, or non-writable keys. For Drizzle-aware checks that handle column metadata and produce a ready-to-persist payload, use the variants below. See [`@umpire/write`](/extensions/write/) for the full result shape and the distinction between issues and fouls.

### Drizzle-aware write checks

For Drizzle-table-aware checks that handle column metadata and produce a ready-to-persist payload, use the Drizzle-specific variants:

#### `checkDrizzleCreate(table, ump, data, options?)`

Shapes the input against table metadata before policy checking. Handles unknown keys, non-writable keys, and builds the final `data` payload ready for `db.insert()`.

```ts
import { checkDrizzleCreate } from '@umpire/drizzle'

const result = checkDrizzleCreate(users, userUmp, req.body, {
  unknownKeys: 'strip',
  context: { tenantId: req.user.tenantId },
})
// result.ok       — false if policy, schema, or column issues exist
// result.data     — shaped payload, ready for db.insert(users).values(result.data)
// result.issues.columns — unknown/non-writable key violations
```

#### `checkDrizzlePatch(table, ump, existing, patch, options?)`

Shapes the patch, auto-clears disabled fields that became stale, and filters out disabled field values from the patch data. Re-runs the policy check when stale clears are applied.

```ts
const existing = await db.select().from(users).where(eq(users.id, id)).limit(1).then(r => r[0])

const result = checkDrizzlePatch(users, userUmp, existing, req.body)
// result.data — filtered patch data, ready for db.update(users).set(result.data)
```

When a field becomes disabled because a dependency changed, its stale value is automatically cleared to `null` in `result.data` — you don't need to track stale clears yourself.

#### `checkDrizzleModelCreate(modelConfig, ump, data, options?)`

Same as `checkDrizzleCreate` but for `fromDrizzleModel` configs. Splits namespaced input by table and returns `dataByTable`.

```ts
const result = checkDrizzleModelCreate(accountModelConfig, accountUmp, req.body)
// result.dataByTable.account — shaped insert payload for the account table
// result.dataByTable.profile  — shaped insert payload for the profile table
```

#### `checkDrizzleModelPatch(modelConfig, ump, existing, patch, options?)`

Patch variant for models. Returns `dataByTable` with stale clears and enabled patch data per table.

```ts
const result = checkDrizzleModelPatch(accountModelConfig, accountUmp, existing, req.body)
// result.dataByTable — ready-to-persist patch data, split by table
```

### Options

All Drizzle write checks accept a shared options type:

```ts
type DrizzleWriteOptions<C = Record<string, unknown>> = {
  context?: C
  unknownKeys?: 'reject' | 'strip'     // default: 'reject'
  nonWritableKeys?: 'reject' | 'strip' // default: 'reject'
}
```

- **`context`** — passes through to Umpire rule predicates as the conditions parameter.
- **`unknownKeys`** — controls keys in the input that don't match any Drizzle column. `'reject'` produces a column issue; `'strip'` silently drops them.
- **`nonWritableKeys`** — controls keys for excluded columns (primary keys, generated columns). `'reject'` produces a column issue; `'strip'` silently drops them.

## Policy Creation

When you need a turnkey setup — derive fields, create an Umpire instance, and get bound write check functions — use the policy constructors.

### `createDrizzlePolicy(table, options)`

Bundles `fromDrizzleTable`, `umpire()`, and `checkDrizzleCreate`/`checkDrizzlePatch` into one object:

```ts
import { enabledWhen } from '@umpire/core'
import { createDrizzlePolicy } from '@umpire/drizzle'

const policy = createDrizzlePolicy(users, {
  rules: [
    enabledWhen('companyName', (values) => values.accountType === 'business'),
  ],
  unknownKeys: 'strip',
})

const result = policy.checkCreate(req.body)
// result.ok, result.data, result.issues — same shape as checkDrizzleCreate
```

Returns `{ fields, rules, ump, checkCreate(), checkPatch() }`. The `ump` instance is accessible for debugging — call `policy.ump.scorecard()`, `policy.ump.challenge()`, etc.

### `createDrizzleModelPolicy(modelConfig, options)`

Same bundling for multi-table models. Use `fromDrizzleModel` to get the `field()` and `name()` helpers for rules, then pass the same config to `createDrizzleModelPolicy`:

```ts
import { enabledWhen } from '@umpire/core'
import { createDrizzleModelPolicy, fromDrizzleModel } from '@umpire/drizzle'

const accountModel = fromDrizzleModel(accountModelConfig)

const policy = createDrizzleModelPolicy(accountModelConfig, {
  rules: [
    enabledWhen(accountModel.field('billing', 'taxId'), (values) => {
      return values[accountModel.name('account', 'accountType')] === 'business'
    }),
  ],
})

const result = policy.checkCreate(req.body)
// result.dataByTable.account, result.dataByTable.billing, ...
```

Returns `{ fields, rules, ump, name(), field(), checkCreate(), checkPatch() }`. `name()` and `field()` are the same helpers from `fromDrizzleModel` for building namespaced field references in rules.

### Policy options

```ts
type DrizzlePolicyOptions<F, C> = {
  table?: FromDrizzleTableOptions   // passed to fromDrizzleTable
  fields?: Partial<Record<string, FieldDef>>  // merged into derived fields
  rules?: Rule<F, C>[]              // appended to derived rules
  validation?: WriteValidationAdapter<F>  // schema validation adapter
  unknownKeys?: 'reject' | 'strip'
  nonWritableKeys?: 'reject' | 'strip'
}
```

- **`fields`** — field overrides merged on top of derived fields. Use this to set `required: true` on a nullable column or adjust `isEmpty`.
- **`rules`** — business rules appended after any table-derived rules.
- **`validation`** — a `WriteValidationAdapter` (from `@umpire/zod` or `@umpire/effect`). When provided, schema validation runs during write checks.
- **`unknownKeys` / `nonWritableKeys`** — defaults applied to all `checkCreate`/`checkPatch` calls; overridable per-call via `callOpts`.

## Validation Composition

Both `checkDrizzleCreate` and `checkDrizzlePatch` (and their model variants, and the policy-bound versions) accept an optional `validation` adapter. When provided, schema validation runs against the Umpire-checked candidate and results are merged via `composeWriteResult`.

```ts
import { createZodAdapter } from '@umpire/zod'
import { checkDrizzleCreate } from '@umpire/drizzle'
import { z } from 'zod'

const validation = createZodAdapter({
  schemas: {
    email: z.string().email('Enter a valid email'),
    companyName: z.string().min(1, 'Company name required'),
  },
})

const result = checkDrizzleCreate(users, userUmp, req.body, { validation })

// result.issues.rules   — availability policy issues
// result.issues.schema  — Zod validation issues
// result.issues.columns — unknown/non-writable key violations
// result.ok             — false if any issue group has entries
```

Validation composition works the same in `createDrizzlePolicy` — pass `validation` at policy creation and it runs on every write check automatically:

```ts
const policy = createDrizzlePolicy(users, {
  rules: [/* ... */],
  validation: createZodAdapter({ schemas: { /* ... */ } }),
})

const result = policy.checkCreate(req.body)
// schema validation runs automatically
```

See [Validation Composition](/extensions/write/#validation-composition) in `@umpire/write` for the generic composition helpers (`composeWriteResult`, `runWriteValidationAdapter`, `WriteValidationAdapter`).

## Result Shape

All Drizzle write results extend `WriteComposedResult` from `@umpire/write`:

```ts
// Single-table result
type DrizzleWriteResult<F, TData> = {
  ok: boolean
  availability: AvailabilityMap<F>
  issues: {
    rules: WriteRuleIssue<F>[]
    schema: WriteSchemaIssue<F>[]
    columns: readonly DrizzleColumnIssue<F>[]
  }
  debug: WriteDebug<F>
  data: TData
}

// Model result
type DrizzleModelWriteResult<F> = {
  ok: boolean
  availability: AvailabilityMap<F>
  issues: {
    rules: WriteRuleIssue<F>[]
    schema: WriteSchemaIssue<F>[]
    columns: readonly DrizzleColumnIssue<F>[]
  }
  debug: WriteDebug<F>
  dataByTable: Record<string, Record<string, unknown>>
}
```

- **`ok`** — `false` if any issue group (rules, schema, or columns) has entries.
- **`issues.rules`** — availability policy issues (required, disabled, foul) plus transition fouls (patch only).
- **`issues.schema`** — field-level validation errors from the adapter. Empty when no `validation` adapter is provided.
- **`issues.columns`** — violations from column-level checks: unknown keys and non-writable keys.
- **`data`** — the shaped, policy-checked payload ready for `db.insert()` or `db.update()`. For patches, disabled but stale values are auto-cleared to `null`.
- **`dataByTable`** — (model only) shaped payload split by table key.
- **`availability`** — the full availability map after evaluation. Useful for conditionally routing after a failed check.
- **`debug`** — candidate snapshot and (when validation ran) the raw validation result.

Column issues use this shape:

```ts
type DrizzleColumnIssue<F> =
  | { kind: 'unknown'; field: string; message: string }
  | { kind: 'nonWritable'; field: keyof F & string; message: string }
```

Run schema validation, authorization, and database constraints separately. Umpire answers whether the candidate respects your availability policy; Drizzle and the database still own persistence correctness.

## Boundary

`@umpire/drizzle` is strongest at deriving availability metadata from table
shape. Pair it with your schema validation, authorization, and database
constraints for a complete write pipeline.

## See also

- [`@umpire/write`](/extensions/write/) — policy-level create and patch checks, and [validation composition](/extensions/write/#validation-composition)
- [`@umpire/zod`](/adapters/validation/zod/) — Zod adapter with nested value shape support for namespaced fields
- [`@umpire/effect`](/adapters/validation/effect/) — Effect adapter with the same nested validation support
- [`umpire()`](/api/umpire/) — the engine constructor that consumes the derived fields
- [Satisfaction](/concepts/satisfaction/) — how Umpire decides whether a value counts as present
- [ESLint plugin](/extensions/eslint-plugin/) — the `no-write-owned-fields` rule for catching database-owned field leaks at lint time
