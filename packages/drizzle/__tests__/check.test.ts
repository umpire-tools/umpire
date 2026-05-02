import { describe, expect, test } from 'bun:test'

import type { FieldDef } from '@umpire/core'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core'

import { fromDrizzleTable } from '../src/table.js'
import { checkDrizzleCreate, checkDrizzlePatch } from '../src/check.js'
import type { UmpireValidationAdapter } from '../src/result.js'

const users = pgTable('users', {
  id: serial().primaryKey(),
  email: varchar({ length: 255 }).notNull(),
  displayName: text(),
  accountType: text().notNull().default('personal'),
  companyName: text(),
})

const base = fromDrizzleTable(users)

function mockAdapter<F extends Record<string, FieldDef>>(
  schemaErrors: Array<{ field: string; message: string }>,
): UmpireValidationAdapter<F> {
  return {
    run() {
      return {
        errors: Object.fromEntries(
          schemaErrors.map((e) => [e.field, e.message]),
        ) as Record<keyof F & string, string>,
        normalizedErrors: schemaErrors,
        result: { success: schemaErrors.length === 0 },
        schemaFields: Object.keys(base.fields) as Array<keyof F & string>,
      }
    },
  }
}

describe('checkDrizzleCreate', () => {
  test('successful create exposes Drizzle payload at data', () => {
    const ump = umpire(base)
    const result = checkDrizzleCreate(users, ump, {
      email: 'a@example.com',
      displayName: 'Alex',
    })

    expect(result.ok).toBe(true)
    expect(result.data).toHaveProperty('email', 'a@example.com')
    expect(result.data).toHaveProperty('displayName', 'Alex')
    expect(result.data).toHaveProperty('accountType', 'personal')
    expect(result.availability).toBeDefined()
    expect(result.debug.candidate).toBeDefined()
    expect((result as Record<string, unknown>).candidate).toBeUndefined()
  })

  test('missing required Umpire field returns rule issue', () => {
    const ump = umpire(base)
    const result = checkDrizzleCreate(users, ump, {})

    expect(result.ok).toBe(false)
    expect(result.issues.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'required',
          field: 'email',
        }),
      ]),
    )
  })

  test('disabled submitted field returns rule issue and does not silently persist', () => {
    const ump = umpire({
      fields: base.fields,
      rules: [
        enabledWhen(
          'companyName',
          (values) => values.accountType === 'business',
        ),
        requires('companyName', (values) => values.accountType === 'business'),
      ],
    })

    const result = checkDrizzleCreate(users, ump, {
      email: 'a@example.com',
      accountType: 'personal',
      companyName: 'Acme',
    })

    expect(result.ok).toBe(false)
    expect(result.issues.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'disabled',
          field: 'companyName',
        }),
      ]),
    )
    expect(result.data).not.toHaveProperty('companyName')
  })

  test('rejects primary key in input', () => {
    const ump = umpire(base)
    const result = checkDrizzleCreate(users, ump, {
      email: 'a@example.com',
      id: 5,
    })

    expect(result.ok).toBe(false)
    expect(result.issues.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'nonWritable', field: 'id' }),
      ]),
    )
    expect(result.data).not.toHaveProperty('id')
  })

  test('rejects unknown keys in input', () => {
    const ump = umpire(base)
    const result = checkDrizzleCreate(users, ump, {
      email: 'a@example.com',
      extraField: 'value',
    })

    expect(result.ok).toBe(false)
    expect(result.issues.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'unknown', field: 'extraField' }),
      ]),
    )
  })

  test('validation adapter failure appears under issues.schema', () => {
    const ump = umpire(base)
    const validation = mockAdapter([
      { field: 'email', message: 'Invalid email format' },
    ])

    const result = checkDrizzleCreate(
      users,
      ump,
      {
        email: 'not-an-email',
      },
      { validation },
    )

    expect(result.ok).toBe(false)
    expect(result.issues.schema).toEqual([
      { field: 'email', message: 'Invalid email format' },
    ])
  })

  test('column failure and schema failure can appear together', () => {
    const ump = umpire(base)
    const validation = mockAdapter([
      { field: 'email', message: 'Invalid email' },
    ])

    const result = checkDrizzleCreate(
      users,
      ump,
      {
        email: 'bad',
        extraField: 'value',
      },
      { validation },
    )

    expect(result.ok).toBe(false)
    expect(result.issues.columns).toHaveLength(1)
    expect(result.issues.schema).toHaveLength(1)
  })

  test('strips unknown keys with unknownKeys option', () => {
    const ump = umpire(base)
    const result = checkDrizzleCreate(
      users,
      ump,
      {
        email: 'a@example.com',
        extraField: 'value',
      },
      { unknownKeys: 'strip' },
    )

    expect(result.ok).toBe(true)
    expect(result.issues.columns).toEqual([])
    expect(result.data).not.toHaveProperty('extraField')
  })
})

describe('checkDrizzlePatch', () => {
  test('successful patch returns patch-shaped data', () => {
    const ump = umpire(base)
    const result = checkDrizzlePatch(
      users,
      ump,
      { email: 'old@example.com', displayName: 'Old', accountType: 'personal' },
      { displayName: 'New Name' },
    )

    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ displayName: 'New Name' })
    expect(result.data).not.toHaveProperty('email')
    expect(result.data).not.toHaveProperty('accountType')
  })

  test('missing required field returns rule issue in patch', () => {
    const ump = umpire(base)
    const result = checkDrizzlePatch(
      users,
      ump,
      { email: 'a@example.com' },
      { email: '' },
    )

    expect(result.ok).toBe(false)
    expect(result.issues.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'required',
          field: 'email',
        }),
      ]),
    )
  })

  test('foul field returns rule issue with kind: foul', () => {
    const ump = umpire({
      fields: base.fields,
      rules: [
        enabledWhen(
          'companyName',
          (values) => values.accountType === 'business',
        ),
      ],
    })

    const result = checkDrizzlePatch(
      users,
      ump,
      { email: 'a@example.com', accountType: 'business', companyName: 'Acme' },
      { accountType: 'personal' },
    )

    expect(result.ok).toBe(false)
    const foulIssues = result.issues.rules.filter((i) => i.kind === 'foul')
    expect(foulIssues.length).toBeGreaterThan(0)
    expect(foulIssues[0]).toEqual(
      expect.objectContaining({
        kind: 'foul',
        field: 'companyName',
      }),
    )
  })

  test('rejects primary key in patch input', () => {
    const ump = umpire(base)
    const result = checkDrizzlePatch(
      users,
      ump,
      { email: 'a@example.com' },
      { email: 'new@example.com', id: 5 },
    )

    expect(result.ok).toBe(false)
    expect(result.issues.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'nonWritable', field: 'id' }),
      ]),
    )
    expect(result.data).not.toHaveProperty('id')
  })

  test('validation adapter failure appears under issues.schema for patch', () => {
    const ump = umpire(base)
    const validation = mockAdapter([
      { field: 'displayName', message: 'Too short' },
    ])

    const result = checkDrizzlePatch(
      users,
      ump,
      { email: 'a@example.com', displayName: 'Old' },
      { displayName: 'x' },
      { validation },
    )

    expect(result.ok).toBe(false)
    expect(result.issues.schema).toEqual([
      { field: 'displayName', message: 'Too short' },
    ])
  })

  test('strips nonWritable keys in patch with nonWritableKeys option', () => {
    const ump = umpire(base)
    const result = checkDrizzlePatch(
      users,
      ump,
      { email: 'a@example.com' },
      { email: 'new@example.com', id: 5 },
      { nonWritableKeys: 'strip' },
    )

    expect(result.ok).toBe(true)
    expect(result.issues.columns).toEqual([])
    expect(result.data).toHaveProperty('email', 'new@example.com')
    expect(result.data).not.toHaveProperty('id')
  })
})
