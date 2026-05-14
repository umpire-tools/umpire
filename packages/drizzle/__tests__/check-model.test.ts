import { describe, expect, test } from 'bun:test'

import type { FieldDef } from '@umpire/core'
import { enabledWhen, umpire } from '@umpire/core'
import {
  enabledWhen as enabledWhenAsync,
  umpire as asyncUmpire,
} from '@umpire/async'
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

import { fromDrizzleModel } from '../src/model.js'
import {
  checkDrizzleModelCreate,
  checkDrizzleModelCreateAsync,
  checkDrizzleModelPatch,
  checkDrizzleModelPatchAsync,
} from '../src/check-model.js'
import type {
  AsyncWriteValidationAdapter,
  WriteValidationAdapter,
} from '@umpire/write'

const accounts = pgTable('accounts', {
  id: serial().primaryKey(),
  email: varchar({ length: 255 }).notNull(),
  accountType: text().notNull().default('personal'),
  companyName: text(),
})

const profiles = pgTable('profiles', {
  id: serial().primaryKey(),
  accountId: integer().notNull(),
  displayName: text(),
  createdAt: timestamp().defaultNow().notNull(),
})

const modelConfig = {
  account: accounts,
  profile: {
    table: profiles,
    exclude: ['createdAt'],
  },
} as const

const model = fromDrizzleModel(modelConfig)

function mockAdapter<F extends Record<string, FieldDef>>(
  errors: Array<{ field: string; message: string }>,
): WriteValidationAdapter<F> {
  return {
    run() {
      return {
        errors: Object.fromEntries(
          errors.map((e) => [e.field, e.message]),
        ) as Record<keyof F & string, string>,
        normalizedErrors: errors,
        result: { success: errors.length === 0 },
        schemaFields: Object.keys(model.fields) as Array<keyof F & string>,
      }
    },
  }
}

describe('checkDrizzleModelCreate', () => {
  test('accepts flat namespaced input and returns dataByTable', () => {
    const ump = umpire(model)
    const result = checkDrizzleModelCreate(modelConfig, ump, {
      'account.email': 'a@example.com',
      'account.accountType': 'business',
      'profile.accountId': 1,
      'profile.displayName': 'Alex',
    })

    expect(result.ok).toBe(true)
    expect(result.dataByTable).toEqual({
      account: expect.objectContaining({
        email: 'a@example.com',
        accountType: 'business',
      }),
      profile: expect.objectContaining({
        displayName: 'Alex',
      }),
    })
  })

  test('static defaults appear in dataByTable for omitted fields', () => {
    const ump = umpire(model)
    const result = checkDrizzleModelCreate(modelConfig, ump, {
      'account.email': 'a@example.com',
      'profile.accountId': 1,
    })

    expect(result.ok).toBe(true)
    expect(result.dataByTable.account).toHaveProperty('accountType', 'personal')
  })

  test('unknown namespace rejects by default', () => {
    const ump = umpire(model)
    const result = checkDrizzleModelCreate(modelConfig, ump, {
      'account.email': 'a@example.com',
      'unknown.field': 'value',
    })

    expect(result.ok).toBe(false)
    expect(result.issues.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'unknown', field: 'unknown.field' }),
      ]),
    )
  })

  test('unknown local field rejects by default', () => {
    const ump = umpire(model)
    const result = checkDrizzleModelCreate(modelConfig, ump, {
      'account.email': 'a@example.com',
      'account.nonexistent': 'value',
    })

    expect(result.ok).toBe(false)
    expect(result.issues.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'unknown',
          field: 'account.nonexistent',
        }),
      ]),
    )
  })

  test('excluded local field rejects with column issue', () => {
    const ump = umpire(model)
    const result = checkDrizzleModelCreate(modelConfig, ump, {
      'account.email': 'a@example.com',
      'profile.createdAt': new Date(),
    })

    expect(result.ok).toBe(false)
    expect(result.issues.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'nonWritable',
          field: 'profile.createdAt',
        }),
      ]),
    )
  })

  test('rule issues use flat namespaced field names', () => {
    const ump = umpire(model)
    const result = checkDrizzleModelCreate(modelConfig, ump, {})

    expect(result.ok).toBe(false)
    expect(result.issues.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'required',
          field: 'account.email',
        }),
      ]),
    )
  })

  test('validation adapter works with namespaced model schemas', () => {
    const ump = umpire(model)
    const validation = mockAdapter([
      { field: 'account.email', message: 'Invalid email format' },
    ])

    const result = checkDrizzleModelCreate(
      modelConfig,
      ump,
      {
        'account.email': 'bad-email',
      },
      { validation },
    )

    expect(result.ok).toBe(false)
    expect(result.issues.schema).toEqual([
      { field: 'account.email', message: 'Invalid email format' },
    ])
  })

  test('disabled rule filters from dataByTable', () => {
    const ruleUmp = umpire({
      fields: model.fields,
      rules: [
        enabledWhen('account.companyName', (values) => {
          return values['account.accountType'] === 'business'
        }),
      ],
    })

    const result = checkDrizzleModelCreate(modelConfig, ruleUmp, {
      'account.email': 'a@example.com',
      'account.accountType': 'personal',
      'account.companyName': 'Acme',
    })

    expect(result.ok).toBe(false)
    expect(result.issues.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'disabled',
          field: 'account.companyName',
        }),
      ]),
    )
    expect(result.dataByTable.account).not.toHaveProperty('companyName')
  })
})

describe('checkDrizzleModelPatch', () => {
  test('returns patch-shaped per-table payloads', () => {
    const ump = umpire(model)
    const result = checkDrizzleModelPatch(
      modelConfig,
      ump,
      {
        'account.email': 'old@example.com',
        'account.accountType': 'personal',
        'profile.accountId': 1,
        'profile.displayName': 'Old Name',
      },
      {
        'profile.displayName': 'New Name',
      },
    )

    expect(result.ok).toBe(true)
    expect(result.dataByTable.profile).toEqual({ displayName: 'New Name' })
    expect(result.dataByTable.account).toEqual({})
  })

  test('rule issues use flat namespaced field names in patch', () => {
    const ump = umpire(model)
    const result = checkDrizzleModelPatch(
      modelConfig,
      ump,
      { 'account.email': 'a@example.com' },
      { 'account.email': '' },
    )

    expect(result.ok).toBe(false)
    expect(result.issues.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'required',
          field: 'account.email',
        }),
      ]),
    )
  })

  test('branch switch includes stale-value clears in dataByTable', () => {
    const ruleUmp = umpire({
      fields: model.fields,
      rules: [
        enabledWhen('account.companyName', (values) => {
          return values['account.accountType'] === 'business'
        }),
      ],
    })

    const result = checkDrizzleModelPatch(
      modelConfig,
      ruleUmp,
      {
        'account.email': 'a@example.com',
        'account.accountType': 'business',
        'account.companyName': 'Acme',
        'profile.accountId': 1,
      },
      { 'account.accountType': 'personal' },
    )

    expect(result.ok).toBe(true)
    const foulIssues = result.issues.rules.filter((i) => i.kind === 'foul')
    expect(foulIssues.length).toBe(0)
    expect(result.dataByTable.account).toHaveProperty('companyName', null)
    expect(result.dataByTable.account).toHaveProperty('accountType', 'personal')
  })

  test('explicit null on disabled namespaced field appears in dataByTable', () => {
    const ruleUmp = umpire({
      fields: model.fields,
      rules: [
        enabledWhen('account.companyName', (values) => {
          return values['account.accountType'] === 'business'
        }),
      ],
    })

    const result = checkDrizzleModelPatch(
      modelConfig,
      ruleUmp,
      {
        'account.email': 'a@example.com',
        'account.accountType': 'personal',
        'account.companyName': 'Acme',
        'profile.accountId': 1,
      },
      { 'account.companyName': null },
    )

    expect(result.ok).toBe(true)
    expect(result.issues.rules).toEqual([])
    expect(result.dataByTable.account).toHaveProperty('companyName', null)
  })

  test('unknown namespace rejects by default in patch', () => {
    const ump = umpire(model)
    const result = checkDrizzleModelPatch(
      modelConfig,
      ump,
      { 'account.email': 'a@example.com' },
      { 'account.email': 'new@example.com', 'unknown.field': 'value' },
    )

    expect(result.ok).toBe(false)
    expect(result.issues.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'unknown', field: 'unknown.field' }),
      ]),
    )
  })
})

describe('async model write helpers', () => {
  test('async create returns dataByTable and awaits validation', async () => {
    const ump = asyncUmpire(model)
    const validation: AsyncWriteValidationAdapter<typeof model.fields> = {
      async run() {
        await Promise.resolve()
        return {
          errors: { 'account.email': 'Invalid email format' },
          normalizedErrors: [
            { field: 'account.email', message: 'Invalid email format' },
          ],
          result: { success: false },
          schemaFields: ['account.email'],
        }
      },
    }

    const result = await checkDrizzleModelCreateAsync(
      modelConfig,
      ump,
      {
        'account.email': 'bad-email',
        'profile.accountId': 1,
      },
      { validation },
    )

    expect(result.ok).toBe(false)
    expect(result.dataByTable.account).toHaveProperty('email', 'bad-email')
    expect(result.dataByTable.profile).toHaveProperty('accountId', 1)
    expect(result.issues.schema).toEqual([
      { field: 'account.email', message: 'Invalid email format' },
    ])
  })

  test('async create filters disabled namespaced fields', async () => {
    const ruleUmp = asyncUmpire({
      fields: model.fields,
      rules: [
        enabledWhenAsync('account.companyName', async (values) => {
          return values['account.accountType'] === 'business'
        }),
      ],
    })

    const result = await checkDrizzleModelCreateAsync(modelConfig, ruleUmp, {
      'account.email': 'a@example.com',
      'account.accountType': 'personal',
      'account.companyName': 'Acme',
    })

    expect(result.ok).toBe(false)
    expect(result.issues.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'disabled',
          field: 'account.companyName',
        }),
      ]),
    )
    expect(result.dataByTable.account).not.toHaveProperty('companyName')
  })

  test('async patch includes stale-value clears in dataByTable', async () => {
    const ruleUmp = asyncUmpire({
      fields: model.fields,
      rules: [
        enabledWhenAsync('account.companyName', async (values) => {
          return values['account.accountType'] === 'business'
        }),
      ],
    })

    const result = await checkDrizzleModelPatchAsync(
      modelConfig,
      ruleUmp,
      {
        'account.email': 'a@example.com',
        'account.accountType': 'business',
        'account.companyName': 'Acme',
        'profile.accountId': 1,
      },
      { 'account.accountType': 'personal' },
    )

    expect(result.ok).toBe(true)
    expect(result.dataByTable.account).toHaveProperty('companyName', null)
    expect(result.dataByTable.account).toHaveProperty('accountType', 'personal')
  })

  test('async patch awaits validation adapter', async () => {
    const ump = asyncUmpire(model)
    const validation: AsyncWriteValidationAdapter<typeof model.fields> = {
      async run() {
        await Promise.resolve()
        return {
          errors: { 'profile.displayName': 'Too short' },
          normalizedErrors: [
            { field: 'profile.displayName', message: 'Too short' },
          ],
          result: { success: false },
          schemaFields: ['profile.displayName'],
        }
      },
    }

    const result = await checkDrizzleModelPatchAsync(
      modelConfig,
      ump,
      { 'account.email': 'a@example.com', 'profile.accountId': 1 },
      { 'profile.displayName': 'x' },
      { validation },
    )

    expect(result.ok).toBe(false)
    expect(result.dataByTable.profile).toEqual({ displayName: 'x' })
    expect(result.issues.schema).toEqual([
      { field: 'profile.displayName', message: 'Too short' },
    ])
  })
})
