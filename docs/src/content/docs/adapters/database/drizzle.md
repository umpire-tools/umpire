---
title: '@umpire/drizzle'
description: Derive Umpire fields from Drizzle ORM table definitions and reuse @umpire/write at the service boundary.
---

`@umpire/drizzle` is a Drizzle ORM adapter for Umpire's policy layer. It reads
Drizzle table columns, derives an Umpire `fields` object, and leaves
cross-field business rules for you to add in code.

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

## Write Checks

`@umpire/drizzle` re-exports `checkCreate` and `checkPatch` from
`@umpire/write`:

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

Run schema validation, authorization, and database constraints separately.
Umpire answers whether the candidate respects your availability policy; Drizzle
and the database still own persistence correctness.
