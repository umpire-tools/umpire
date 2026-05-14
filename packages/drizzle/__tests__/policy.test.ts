import { describe, expect, test } from 'bun:test'

import type { FieldDef } from '@umpire/core'
import { enabledWhen, requires } from '@umpire/core'
import {
  enabledWhen as enabledWhenAsync,
  requires as requiresAsync,
} from '@umpire/async'
import { integer, pgTable, serial, text, varchar } from 'drizzle-orm/pg-core'

import { fromDrizzleModel, fromDrizzleTable } from '../src/index.js'
import {
  createAsyncDrizzleModelPolicy,
  createAsyncDrizzlePolicy,
  createDrizzleModelPolicy,
  createDrizzlePolicy,
} from '../src/policy.js'
import type { UmpireValidationAdapter } from '../src/result.js'

const users = pgTable('users', {
  id: serial().primaryKey(),
  email: varchar({ length: 255 }).notNull(),
  displayName: text(),
  accountType: text().notNull().default('personal'),
  companyName: text(),
})

function mockAdapter<F extends Record<string, FieldDef>>(
  errors: Array<{ field: string; message: string }> = [],
): UmpireValidationAdapter<F> {
  return {
    run() {
      return {
        errors: Object.fromEntries(
          errors.map((e) => [e.field, e.message]),
        ) as Record<keyof F & string, string>,
        normalizedErrors: errors,
        result: { success: errors.length === 0 },
        schemaFields: Object.keys({} as F) as Array<keyof F & string>,
      }
    },
  }
}

describe('createDrizzlePolicy', () => {
  test('creates equivalent fields to fromDrizzleTable', () => {
    const derived = fromDrizzleTable(users)
    const policy = createDrizzlePolicy(users)

    expect(Object.keys(policy.fields).sort()).toEqual(
      Object.keys(derived.fields).sort(),
    )
  })

  test('applies handwritten rules', () => {
    const policy = createDrizzlePolicy(users, {
      rules: [
        enabledWhen(
          'companyName',
          (values) => values.accountType === 'business',
        ),
      ],
    })

    const result = policy.checkCreate({
      email: 'a@example.com',
      accountType: 'personal',
      companyName: 'Acme',
    })

    expect(result.ok).toBe(false)
    expect(result.issues.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'companyName', kind: 'disabled' }),
      ]),
    )
  })

  test('uses supplied validation adapter', () => {
    const validation = mockAdapter([
      { field: 'email', message: 'Invalid email' },
    ])
    const policy = createDrizzlePolicy(users, { validation })

    const result = policy.checkCreate({ email: 'bad' })

    expect(result.ok).toBe(false)
    expect(result.issues.schema).toEqual([
      { field: 'email', message: 'Invalid email' },
    ])
  })

  test('exposes fields, rules, and ump', () => {
    const policy = createDrizzlePolicy(users)

    expect(policy.fields).toBeDefined()
    expect(policy.rules).toBeDefined()
    expect(policy.ump).toBeDefined()
    expect(typeof policy.ump.check).toBe('function')
  })

  test('per-call unknownKeys override builder default', () => {
    const policy = createDrizzlePolicy(users, { unknownKeys: 'reject' })

    const result = policy.checkCreate(
      { email: 'a@example.com', extra: 'value' },
      { unknownKeys: 'strip' },
    )

    expect(result.ok).toBe(true)
    expect(result.issues.columns).toEqual([])
  })

  test('per-call nonWritableKeys override builder default', () => {
    const policy = createDrizzlePolicy(users, { nonWritableKeys: 'reject' })

    const result = policy.checkCreate(
      { email: 'a@example.com', id: 5 },
      { nonWritableKeys: 'strip' },
    )

    expect(result.ok).toBe(true)
    expect(result.issues.columns).toEqual([])
  })

  test('checkPatch returns patch-shaped data', () => {
    const policy = createDrizzlePolicy(users)

    const result = policy.checkPatch(
      { email: 'old@example.com', displayName: 'Old' },
      { displayName: 'New' },
    )

    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ displayName: 'New' })
  })

  test('checkPatch respects validation adapter', () => {
    const validation = mockAdapter([
      { field: 'displayName', message: 'Too short' },
    ])
    const policy = createDrizzlePolicy(users, { validation })

    const result = policy.checkPatch(
      { email: 'a@example.com', displayName: 'Old' },
      { displayName: 'x' },
    )

    expect(result.ok).toBe(false)
    expect(result.issues.schema).toEqual([
      { field: 'displayName', message: 'Too short' },
    ])
  })
})

describe('createDrizzleModelPolicy', () => {
  const accounts = pgTable('accounts', {
    id: serial().primaryKey(),
    email: varchar({ length: 255 }).notNull(),
    accountType: text().notNull().default('personal'),
  })
  const profiles = pgTable('profiles', {
    id: serial().primaryKey(),
    accountId: integer().notNull(),
    displayName: text(),
  })

  const modelConfig = { account: accounts, profile: profiles } as const

  test('creates equivalent fields to fromDrizzleModel', () => {
    const derived = fromDrizzleModel(modelConfig)
    const policy = createDrizzleModelPolicy(modelConfig)

    expect(Object.keys(policy.fields).sort()).toEqual(
      Object.keys(derived.fields).sort(),
    )
  })

  test('applies handwritten namespaced rules', () => {
    const policy = createDrizzleModelPolicy(modelConfig, {
      rules: [requires('account.email', () => true) as never],
    })

    const result = policy.checkCreate({})

    expect(result.ok).toBe(false)
    expect(result.issues.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'account.email', kind: 'required' }),
      ]),
    )
  })

  test('uses supplied validation adapter', () => {
    const validation = mockAdapter([
      { field: 'account.email', message: 'Invalid email' },
    ])
    const policy = createDrizzleModelPolicy(modelConfig, { validation })

    const result = policy.checkCreate({
      'account.email': 'bad',
      'profile.accountId': 1,
    })

    expect(result.ok).toBe(false)
    expect(result.issues.schema).toEqual([
      { field: 'account.email', message: 'Invalid email' },
    ])
  })

  test('exposes fields, rules, ump, name, and field', () => {
    const policy = createDrizzleModelPolicy(modelConfig)

    expect(policy.fields).toBeDefined()
    expect(policy.rules).toBeDefined()
    expect(policy.ump).toBeDefined()
    expect(policy.name).toBeDefined()
    expect(policy.field).toBeDefined()
    expect(typeof policy.name).toBe('function')
    expect(typeof policy.field).toBe('function')
    expect(typeof policy.checkCreate).toBe('function')
    expect(typeof policy.checkPatch).toBe('function')
  })

  test('checkPatch returns patch-shaped per-table data', () => {
    const policy = createDrizzleModelPolicy(modelConfig)

    const result = policy.checkPatch(
      {
        'account.email': 'old@example.com',
        'account.accountType': 'personal',
        'profile.accountId': 1,
        'profile.displayName': 'Old Name',
      },
      { 'profile.displayName': 'New Name' },
    )

    expect(result.ok).toBe(true)
    expect(result.dataByTable.profile).toEqual({ displayName: 'New Name' })
    expect(Object.keys(result.dataByTable.account)).toEqual([])
  })
})

describe('async Drizzle policies', () => {
  test('createAsyncDrizzlePolicy applies async handwritten rules', async () => {
    const policy = createAsyncDrizzlePolicy(users, {
      rules: [
        enabledWhenAsync(
          'companyName',
          async (values) => values.accountType === 'business',
        ),
      ],
    })

    const result = await policy.checkCreate({
      email: 'a@example.com',
      accountType: 'personal',
      companyName: 'Acme',
    })

    expect(result.ok).toBe(false)
    expect(result.issues.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'companyName', kind: 'disabled' }),
      ]),
    )
  })

  test('createAsyncDrizzleModelPolicy applies async namespaced rules', async () => {
    const accounts = pgTable('async_accounts', {
      id: serial().primaryKey(),
      email: varchar({ length: 255 }).notNull(),
    })
    const profiles = pgTable('async_profiles', {
      id: serial().primaryKey(),
      accountId: integer().notNull(),
      displayName: text(),
    })
    const modelConfig = { account: accounts, profile: profiles } as const
    const policy = createAsyncDrizzleModelPolicy(modelConfig, {
      rules: [requiresAsync('account.email', async () => true) as never],
    })

    const result = await policy.checkCreate({})

    expect(result.ok).toBe(false)
    expect(result.issues.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'account.email', kind: 'required' }),
      ]),
    )
  })
})
