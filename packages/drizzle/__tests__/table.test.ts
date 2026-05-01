import { describe, expect, test } from 'bun:test'

import { umpire } from '@umpire/core'
import * as drizzleAdapter from '@umpire/drizzle'
import { checkCreate, checkPatch, fromDrizzleTable } from '@umpire/drizzle'
import {
  boolean,
  integer,
  jsonb,
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

  test('allows explicit excludes and per-field overrides', () => {
    const { fields } = fromDrizzleTable(users, {
      exclude: ['externalId', 'createdAt'],
      isEmpty: {
        displayName: (value) => value === 'anonymous' || value == null,
        accountType: 'string',
      },
      required: {
        companyName: true,
      },
    })
    const ump = umpire({ fields, rules: [] })

    expect(fields.externalId).toBeUndefined()
    expect(fields.createdAt).toBeUndefined()
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

describe('write re-exports', () => {
  test('re-exports checkCreate and checkPatch from @umpire/write', () => {
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

  test('exports the public runtime surface', () => {
    expect(Object.keys(drizzleAdapter).sort()).toEqual([
      'checkCreate',
      'checkPatch',
      'fromDrizzleTable',
    ])
  })
})
