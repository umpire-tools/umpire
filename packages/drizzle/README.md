# @umpire/drizzle

When your server-side state is modeled in Drizzle, `@umpire/drizzle` gives you the fastest way to start an Umpire policy from real schema metadata. It derives a `fields` object from your table columns so you can focus on the cross-field business rules that Drizzle doesn't know about — "companyName is required for business accounts" — and run consistent policy checks before persistence via `checkCreate` and `checkPatch`.

[Docs](https://umpire.tools/adapters/database/drizzle/) · [Quick Start](https://umpire.tools/learn/)

## Install

```bash
yarn add @umpire/core @umpire/write @umpire/drizzle drizzle-orm
```

`drizzle-orm` is a peer dependency. This RC targets Drizzle `1.0.0-rc.1` and newer 1.x releases.

## Usage

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

const userUmp = umpire({
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

## API

```ts
import {
  fromDrizzleModel,
  fromDrizzleTable,
  checkCreate,
  checkPatch,
} from '@umpire/drizzle'
import type {
  DrizzleIsEmptyStrategy,
  FromDrizzleModelResult,
  FromDrizzleTableOptions,
  FromDrizzleTableResult,
} from '@umpire/drizzle'
```

### `fromDrizzleTable(table, options?)`

Reads Drizzle column metadata via `getColumns()` and returns `{ fields, rules }`. Primary keys and generated columns are excluded by default. Requiredness comes from `notNull` unless the column has a Drizzle default, runtime default, or update function. Static primitive defaults are copied to the Umpire field definition; SQL and runtime defaults are treated as storage-layer behavior and are not copied.

```ts
const { fields, rules } = fromDrizzleTable(users, {
  exclude: ['createdAt', 'updatedAt'],
  isEmpty: {
    companyName: 'string',
  },
  required: {
    companyName: true,
  },
})
```

`rules` is currently empty. Drizzle knows column shape; it does not know your business availability policy.

#### Options

```ts
type FromDrizzleTableOptions = {
  exclude?: readonly string[] // omit by TypeScript property name
  isEmpty?: Record<
    string,
    DrizzleIsEmptyStrategy | NonNullable<FieldDef['isEmpty']>
  > // override satisfaction strategy
  required?: Record<string, boolean> // override requiredness
}
```

Built-in `isEmpty` strategies: `'present'`, `'string'`, `'number'`, `'bigint'`, `'boolean'`, `'array'`, `'object'`.

### `fromDrizzleModel(model)`

Composes multiple Drizzle tables into one collision-proof Umpire policy surface.
Each table is namespaced into flat field keys like `account.email` and
`billing.taxId`.

```ts
const model = fromDrizzleModel({
  account: accounts,
  billing: {
    table: billingProfiles,
    exclude: ['createdAt'],
  },
})

const policy = umpire({
  fields: model.fields,
  rules: [
    enabledWhen(model.field('billing', 'taxId'), (values) => {
      return values[model.name('account', 'accountType')] === 'business'
    }),
  ],
})
```

Entries may be either a table or `{ table, ...fromDrizzleTableOptions }`.
`model.name(namespace, field)` returns the namespaced string key, and
`model.field(namespace, field)` returns a named Umpire field ref for rule
helpers.

### `checkCreate`, `checkPatch`

Re-exported from [`@umpire/write`](https://www.npmjs.com/package/@umpire/write). Use them to check whether a create or patch candidate passes Umpire availability policy before persisting:

```ts
const result = checkPatch(userUmp, existingUser, patch)
if (!result.ok) {
  return Response.json(
    { errors: result.errors, fouls: result.fouls },
    { status: 422 },
  )
}

await db.update(users).set(patch)
```

## Validation Composition

When you want to combine Umpire write-policy issues with schema validation
errors (from Zod, Effect, etc.), use `composeWriteResult` and
`WriteValidationAdapter` from `@umpire/write`. Drizzle's write-pipeline
helpers (`createDrizzlePolicy`, `checkDrizzleCreate`, etc.) accept a
`WriteValidationAdapter` to integrate schema checks alongside column-derived
availability policy.

Drizzle owns column shaping and write-payload concerns; generic validation
result composition lives in `@umpire/write`.

## Boundary

`@umpire/drizzle` is strongest at deriving availability metadata from table shape. Pair it with your schema validation, authorization, and database constraints for a complete write pipeline.

## Docs

- [Drizzle adapter](https://umpire.tools/adapters/database/drizzle/) — column mapping table, write checks, and boundary guide
- [@umpire/write](https://umpire.tools/extensions/write/) — full result shape for `checkCreate`/`checkPatch`
- [Quick Start](https://umpire.tools/learn/) — learn each rule primitive
