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

## Example

```ts
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { checkCreate, fromDrizzleTable } from '@umpire/drizzle'

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

`@umpire/drizzle` re-exports `checkCreate` and `checkPatch` from
`@umpire/write` so your service layer can check availability policy before
calling Drizzle's `db.insert()` or `db.update()`:

```ts
import { checkPatch } from '@umpire/drizzle'

const result = checkPatch(userUmp, existingUser, patch)
if (!result.ok) {
  return Response.json(
    { errors: result.errors, fouls: result.fouls },
    { status: 422 },
  )
}

await db.update(users).set(patch)
```

Run schema validation, authorization, and database constraints separately.
Umpire answers whether the candidate respects your availability policy; Drizzle
and the database still own persistence correctness.

See [`@umpire/write`](/umpire/extensions/write/) for the full result shape and
the distinction between issues and fouls.

## Boundary

`@umpire/drizzle` is strongest at deriving availability metadata from table
shape. Pair it with your schema validation, authorization, and database
constraints for a complete write pipeline.

## See also

- [`@umpire/write`](/umpire/extensions/write/) — policy-level create and patch checks
- [`umpire()`](/umpire/api/umpire/) — the engine constructor that consumes the derived fields
- [Satisfaction](/umpire/concepts/satisfaction/) — how Umpire decides whether a value counts as present
