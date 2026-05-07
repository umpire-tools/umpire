import { describe, expect, test } from 'bun:test'

import { enabledWhen, umpire } from '@umpire/core'
import { checkCreate, checkPatch } from '@umpire/write'
import { checkAssert } from '@umpire/testing'
import * as drizzleAdapter from '@umpire/drizzle'
import { fromDrizzleModel, fromDrizzleTable } from '@umpire/drizzle'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  integer,
  json,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { integer as sqliteInteger, sqliteTable } from 'drizzle-orm/sqlite-core'

describe('fromDrizzleTable', () => {
  const accountType = pgEnum('account_type', ['personal', 'business'])

  const users = pgTable('users', {
    id: serial().primaryKey(),
    externalId: uuid().defaultRandom(),
    email: varchar({ length: 255 }).notNull(),
    displayName: text(),
    accountType: accountType().notNull().default('personal'),
    companyName: text(),
    settings: jsonb(),
    enabled: boolean().notNull().default(true),
    age: integer(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp()
      .notNull()
      .$onUpdate(() => new Date()),
  })

  test('derives fields from writable table columns', () => {
    const { fields, rules } = fromDrizzleTable(users)

    expect(rules).toEqual([])
    expect(Object.keys(fields)).toEqual([
      'externalId',
      'email',
      'displayName',
      'accountType',
      'companyName',
      'settings',
      'enabled',
      'age',
      'createdAt',
      'updatedAt',
    ])
    expect(fields.id).toBeUndefined()
    expect(fields.email).toMatchObject({ required: true })
    expect(fields.displayName).toMatchObject({ required: false })
    expect(fields.accountType).toEqual({
      required: false,
      default: 'personal',
    })
    expect(fields.enabled).toMatchObject({ required: false, default: true })
    expect(fields.createdAt).toEqual({ required: false })
    expect(fields.updatedAt).toEqual({ required: false })
  })

  test('maps Drizzle data types to satisfaction strategies', () => {
    const { fields } = fromDrizzleTable(users)
    const ump = umpire({ fields, rules: [] })

    expect(ump.check({ email: '' }).email.satisfied).toBe(false)
    expect(ump.check({ email: 'a@example.com' }).email.satisfied).toBe(true)
    expect(ump.check({ age: '' }).age.satisfied).toBe(false)
    expect(ump.check({ age: 0 }).age.satisfied).toBe(true)
    expect(ump.check({ enabled: false }).enabled.satisfied).toBe(true)
    expect(ump.check({ enabled: 'yes' }).enabled.satisfied).toBe(false)
    expect(ump.check({ settings: {} }).settings.satisfied).toBe(false)
    expect(ump.check({ settings: { theme: 'dark' } }).settings.satisfied).toBe(
      true,
    )
    expect(ump.check({ accountType: '' }).accountType.satisfied).toBe(true)
    expect(ump.check({ createdAt: '2026-04-30' }).createdAt.satisfied).toBe(
      true,
    )
  })

  test('covers scalar, array, JSON, and date satisfaction strategies', () => {
    const inventory = pgTable('inventory', {
      sku: text('sku_code').notNull(),
      serials: text().array(),
      count: integer(),
      price: numeric({ mode: 'number' }),
      ledgerId: bigint({ mode: 'bigint' }),
      legacyId: bigint({ mode: 'string' }),
      active: boolean(),
      metadata: json(),
      shippedOn: date(),
    })
    const { fields } = fromDrizzleTable(inventory)
    const ump = umpire({ fields, rules: [] })

    expect(Object.keys(fields)).toEqual([
      'sku',
      'serials',
      'count',
      'price',
      'ledgerId',
      'legacyId',
      'active',
      'metadata',
      'shippedOn',
    ])
    expect(ump.check({ sku: '' }).sku.satisfied).toBe(false)
    expect(ump.check({ sku: 'BAT-42' }).sku.satisfied).toBe(true)
    expect(ump.check({ serials: [] }).serials.satisfied).toBe(false)
    expect(ump.check({ serials: ['A'] }).serials.satisfied).toBe(true)
    expect(ump.check({ count: Number.NaN }).count.satisfied).toBe(false)
    expect(ump.check({ count: 0 }).count.satisfied).toBe(true)
    expect(ump.check({ price: '12.50' }).price.satisfied).toBe(false)
    expect(ump.check({ price: 12.5 }).price.satisfied).toBe(true)
    expect(ump.check({ ledgerId: 1 }).ledgerId.satisfied).toBe(false)
    expect(ump.check({ ledgerId: 1n }).ledgerId.satisfied).toBe(true)
    expect(ump.check({ legacyId: '' }).legacyId.satisfied).toBe(false)
    expect(ump.check({ legacyId: '42' }).legacyId.satisfied).toBe(true)
    expect(ump.check({ active: false }).active.satisfied).toBe(true)
    expect(ump.check({ metadata: [] }).metadata.satisfied).toBe(false)
    expect(ump.check({ metadata: { fragile: true } }).metadata.satisfied).toBe(
      true,
    )
    expect(ump.check({ shippedOn: '2026-04-30' }).shippedOn.satisfied).toBe(
      true,
    )
  })

  test('uses TypeScript property names rather than database column names', () => {
    const contacts = pgTable('contacts', {
      displayName: text('display_name').notNull(),
      phoneNumber: text('phone_number'),
    })

    const { fields } = fromDrizzleTable(contacts)

    expect(Object.keys(fields)).toEqual(['displayName', 'phoneNumber'])
    expect(fields.display_name).toBeUndefined()
    expect(fields.phone_number).toBeUndefined()
  })

  test('allows explicit excludes and per-field overrides', () => {
    const { fields } = fromDrizzleTable(users, {
      exclude: ['externalId', 'createdAt'],
      isEmpty: {
        displayName: (value) => value === 'anonymous' || value == null,
        accountType: 'string',
      },
      required: {
        email: false,
        companyName: true,
      },
    })
    const ump = umpire({ fields, rules: [] })

    expect(fields.externalId).toBeUndefined()
    expect(fields.createdAt).toBeUndefined()
    expect(fields.email.required).toBe(false)
    expect(fields.companyName.required).toBe(true)
    expect(ump.check({ displayName: 'anonymous' }).displayName.satisfied).toBe(
      false,
    )
    expect(ump.check({ accountType: '' }).accountType.satisfied).toBe(false)
  })

  test('treats runtime defaults as optional without copying default values', () => {
    const ids = pgTable('ids', {
      id: uuid().primaryKey().defaultRandom(),
      byDefaultIdentity: integer().generatedByDefaultAsIdentity(),
      alwaysIdentity: integer().generatedAlwaysAsIdentity(),
      generated: uuid().defaultRandom().notNull(),
      runtime: text()
        .notNull()
        .$defaultFn(() => 'runtime'),
    })

    const { fields } = fromDrizzleTable(ids)

    expect(fields.id).toBeUndefined()
    expect(fields.byDefaultIdentity).toBeUndefined()
    expect(fields.alwaysIdentity).toBeUndefined()
    expect(fields.generated).toMatchObject({ required: false })
    expect(fields.runtime).toMatchObject({ required: false })
  })

  test('copies only static primitive defaults from Drizzle metadata', () => {
    const defaults = pgTable('defaults', {
      status: text().notNull().default('draft'),
      retries: integer().notNull().default(3),
      archived: boolean().notNull().default(false),
      generatedCode: text()
        .notNull()
        .default(sql`gen_random_uuid()`),
      runtimeCode: text()
        .notNull()
        .$defaultFn(() => 'runtime'),
      updatedAt: timestamp()
        .notNull()
        .$onUpdate(() => new Date()),
    })

    const { fields } = fromDrizzleTable(defaults)

    expect(fields.status).toMatchObject({
      required: false,
      default: 'draft',
    })
    expect(fields.retries).toMatchObject({
      required: false,
      default: 3,
    })
    expect(fields.archived).toMatchObject({
      required: false,
      default: false,
    })
    expect(fields.generatedCode).toMatchObject({ required: false })
    expect(fields.generatedCode.default).toBeUndefined()
    expect(fields.runtimeCode).toMatchObject({ required: false })
    expect(fields.runtimeCode.default).toBeUndefined()
    expect(fields.updatedAt).toMatchObject({ required: false })
    expect(fields.updatedAt.default).toBeUndefined()
  })

  test('excludes generated expression and identity columns by default', () => {
    const projections = pgTable('projections', {
      firstName: text().notNull(),
      lastName: text().notNull(),
      fullName: text().generatedAlwaysAs(
        sql`${sql.identifier('first_name')} || ' ' || ${sql.identifier(
          'last_name',
        )}`,
      ),
      sequence: integer().generatedByDefaultAsIdentity(),
    })

    const { fields } = fromDrizzleTable(projections)

    expect(Object.keys(fields)).toEqual(['firstName', 'lastName'])
    expect(fields.fullName).toBeUndefined()
    expect(fields.sequence).toBeUndefined()
  })

  test('handles SQLite boolean and timestamp modes', () => {
    const flags = sqliteTable('flags', {
      id: sqliteInteger().primaryKey({ autoIncrement: true }),
      enabled: sqliteInteger({ mode: 'boolean' }).notNull(),
      publishedAt: sqliteInteger({ mode: 'timestamp' }),
    })
    const { fields } = fromDrizzleTable(flags)
    const ump = umpire({ fields, rules: [] })

    expect(Object.keys(fields)).toEqual(['enabled', 'publishedAt'])
    expect(fields.enabled.required).toBe(true)
    expect(ump.check({ enabled: false }).enabled.satisfied).toBe(true)
    expect(ump.check({ enabled: 0 }).enabled.satisfied).toBe(false)
    expect(ump.check({ publishedAt: new Date() }).publishedAt.satisfied).toBe(
      true,
    )
  })
})

describe('write checks with derived fields', () => {
  test('checkCreate and checkPatch work with fields derived from Drizzle tables', () => {
    const users = pgTable('users_for_write', {
      id: serial().primaryKey(),
      email: text().notNull(),
    })
    const config = fromDrizzleTable(users)
    const ump = umpire(config)

    expect(checkCreate(ump, {}).ok).toBe(false)
    expect(checkCreate(ump, { email: 'a@example.com' }).ok).toBe(true)
    expect(checkPatch(ump, { email: 'a@example.com' }, { email: '' }).ok).toBe(
      false,
    )
  })

  test('composes derived fields with handwritten availability rules', () => {
    const users = pgTable('users_for_rules', {
      id: serial().primaryKey(),
      accountType: text().notNull().default('personal'),
      companyName: text(),
    })
    const base = fromDrizzleTable(users)
    const ump = umpire({
      fields: base.fields,
      rules: [
        enabledWhen('companyName', (values) => {
          return values.accountType === 'business'
        }),
      ],
    })

    const createResult = checkCreate(ump, {
      accountType: 'personal',
      companyName: 'Acme',
    })
    const patchResult = checkPatch(
      ump,
      { accountType: 'business', companyName: 'Acme' },
      { accountType: 'personal' },
    )

    expect(createResult.ok).toBe(false)
    expect(createResult.issues).toEqual([
      {
        kind: 'disabled',
        field: 'companyName',
        message: 'condition not met',
      },
    ])
    expect(patchResult.ok).toBe(false)
    expect(patchResult.fouls).toEqual([
      {
        field: 'companyName',
        reason: 'condition not met',
        suggestedValue: undefined,
      },
    ])
  })

  test('exports the public runtime surface', () => {
    const keys = Object.keys(drizzleAdapter).sort()
    expect(keys).toContain('fromDrizzleTable')
    expect(keys).toContain('fromDrizzleModel')
    expect(keys).toContain('checkDrizzleCreate')
    expect(keys).toContain('checkDrizzlePatch')
    expect(keys).toContain('checkDrizzleModelCreate')
    expect(keys).toContain('checkDrizzleModelPatch')
    expect(keys).toContain('createDrizzlePolicy')
    expect(keys).toContain('createDrizzleModelPolicy')
    expect(keys).toContain('getTableColumnsMeta')
    expect(keys).not.toContain('checkCreate')
    expect(keys).not.toContain('checkPatch')
  })
})

describe('fromDrizzleModel', () => {
  test('composes multiple tables into namespaced flat fields', () => {
    const accounts = pgTable('model_accounts', {
      id: serial().primaryKey(),
      email: text().notNull(),
      accountType: text().notNull().default('personal'),
    })
    const profiles = pgTable('model_profiles', {
      id: serial().primaryKey(),
      accountId: integer().notNull(),
      displayName: text(),
      createdAt: timestamp().defaultNow().notNull(),
    })

    const model = fromDrizzleModel({
      account: accounts,
      profile: {
        table: profiles,
        exclude: ['createdAt'],
        required: {
          displayName: true,
        },
      },
    })

    expect(Object.keys(model.fields)).toEqual([
      'account.email',
      'account.accountType',
      'profile.accountId',
      'profile.displayName',
    ])
    expect(model.fields['account.email'].required).toBe(true)
    expect(model.fields['account.accountType']).toMatchObject({
      required: false,
      default: 'personal',
    })
    expect(model.fields['profile.accountId'].required).toBe(true)
    expect(model.fields['profile.displayName'].required).toBe(true)
    expect(model.fields['account.id']).toBeUndefined()
    expect(model.fields['profile.createdAt']).toBeUndefined()
    expect(model.rules).toEqual([])
  })

  test('provides typed field-name helpers for rules over namespaced fields', () => {
    const accounts = pgTable('model_rule_accounts', {
      id: serial().primaryKey(),
      accountType: text().notNull().default('personal'),
    })
    const billing = pgTable('model_rule_billing', {
      id: serial().primaryKey(),
      taxId: text(),
    })
    const model = fromDrizzleModel({ account: accounts, billing })
    const taxId = model.name('billing', 'taxId')
    const taxIdField = model.field('billing', 'taxId')
    const ump = umpire({
      fields: model.fields,
      rules: [
        enabledWhen(taxIdField, (values) => {
          return values[model.name('account', 'accountType')] === 'business'
        }),
      ],
    })

    expect(taxId).toBe('billing.taxId')
    expect(model.fields['billing.taxId']).toMatchObject({ required: false })
    checkAssert(ump.check({ 'account.accountType': 'personal' }))
      .disabled(taxId)
      .reason(taxId, 'condition not met')
    checkAssert(
      ump.check({
        'account.accountType': 'business',
        'billing.taxId': '12-3456789',
      }),
    )
      .enabled(taxId)
      .satisfied(taxId)
  })

  test('throws when dotted namespaces and field names collide', () => {
    const profile = pgTable('model_collision_profile', {
      'name.first': text(),
    })
    const profileName = pgTable('model_collision_profile_name', {
      first: text(),
    })

    expect(() =>
      fromDrizzleModel({
        profile,
        'profile.name': profileName,
      }),
    ).toThrow('Duplicate model field "profile.name.first"')
  })
})
