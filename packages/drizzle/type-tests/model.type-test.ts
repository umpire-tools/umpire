import { fromDrizzleModel, fromDrizzleTable } from '../src/index.js'
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

const accounts = pgTable('type_test_accounts', {
  id: serial().primaryKey(),
  email: text().notNull(),
  accountType: text().notNull().default('personal'),
})

const profiles = pgTable('type_test_profiles', {
  id: serial().primaryKey(),
  accountId: integer().notNull(),
  displayName: text(),
  createdAt: timestamp().defaultNow().notNull(),
})

const table = fromDrizzleTable(accounts)

const emailField = table.fields.email
const idField = table.fields.id

const tableWithExclude = fromDrizzleTable(accounts, {
  exclude: ['email'],
} as const)

const accountTypeField = tableWithExclude.fields.accountType

// @ts-expect-error literal excludes are excluded from table fields
const excludedEmailField = tableWithExclude.fields.email

const model = fromDrizzleModel({
  account: accounts,
  profile: {
    table: profiles,
    exclude: ['createdAt'],
  },
})

const accountEmailName: 'account.email' = model.name('account', 'email')
const profileDisplayNameRef = model.field('profile', 'displayName')
const accountEmailField = model.fields['account.email']
const profileAccountIdField = model.fields['profile.accountId']

// @ts-expect-error unknown namespace should be rejected
const badNamespace = model.name('billing', 'email')

// @ts-expect-error field must belong to the selected namespace
const crossNamespaceField = model.name('profile', 'email')

// @ts-expect-error excluded fields should not be available in the model
const excludedModelField = model.name('profile', 'createdAt')

// Known Drizzle 1.0 RC typing gap: runtime metadata excludes primary keys, but
// Drizzle's column types expose primary-key state as boolean for built columns,
// so Umpire cannot currently remove id from the derived field type.
const primaryKeyModelField = model.name('account', 'id')
const primaryKeyField = model.fields['account.id']

void emailField
void idField
void accountTypeField
void excludedEmailField
void accountEmailName
void profileDisplayNameRef
void accountEmailField
void profileAccountIdField
void badNamespace
void crossNamespaceField
void excludedModelField
void primaryKeyModelField
void primaryKeyField
