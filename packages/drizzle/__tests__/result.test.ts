import { describe, expect, test } from 'bun:test'

import { umpire } from '@umpire/core'
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'

import { checkDrizzleModelCreate } from '../src/check-model.js'
import { checkDrizzleCreate, checkDrizzlePatch } from '../src/check.js'
import { fromDrizzleModel } from '../src/model.js'
import { fromDrizzleTable } from '../src/table.js'

const users = pgTable('users', {
  id: serial().primaryKey(),
  email: text().notNull(),
  displayName: text(),
})

const profiles = pgTable('profiles', {
  id: serial().primaryKey(),
  userId: integer().notNull(),
  bio: text(),
})

const base = fromDrizzleTable(users)

const modelConfig = {
  user: users,
  profile: profiles,
} as const
const model = fromDrizzleModel(modelConfig)

describe('Drizzle result shape', () => {
  test('create returns data and column issues from the real pipeline', () => {
    const ump = umpire(base)

    const result = checkDrizzleCreate(users, ump, {
      email: 'a@example.com',
      displayName: 'Alex',
      extraField: 'ignored',
      id: 1,
    })

    expect(result.ok).toBe(false)
    expect(result.data).toEqual({
      email: 'a@example.com',
      displayName: 'Alex',
    })
    expect(result.issues.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'unknown', field: 'extraField' }),
        expect.objectContaining({ kind: 'nonWritable', field: 'id' }),
      ]),
    )
    expect(result.issues.rules).toEqual([])
    expect(result.issues.schema).toEqual([])
    expect(result.debug.candidate).toEqual({
      email: 'a@example.com',
      displayName: 'Alex',
    })
    expect((result as Record<string, unknown>).candidate).toBeUndefined()
  })

  test('patch returns only patch-shaped data and column issues', () => {
    const ump = umpire(base)

    const result = checkDrizzlePatch(
      users,
      ump,
      { email: 'old@example.com', displayName: 'Old' },
      { displayName: 'New', id: 1 },
    )

    expect(result.ok).toBe(false)
    expect(result.data).toEqual({ displayName: 'New' })
    expect(result.issues.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'nonWritable', field: 'id' }),
      ]),
    )
    expect(result.issues.rules).toEqual([])
    expect(result.issues.schema).toEqual([])
  })

  test('single-table results expose data', () => {
    const ump = umpire(base)

    const result = checkDrizzleCreate(users, ump, {
      email: 'a@example.com',
    })

    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ email: 'a@example.com' })
    expect((result as Record<string, unknown>).dataByTable).toBeUndefined()
  })

  test('model results expose dataByTable without top-level data', () => {
    const ump = umpire(model)

    const result = checkDrizzleModelCreate(modelConfig, ump, {
      'user.email': 'a@example.com',
      'profile.userId': 1,
      'profile.bio': 'Hello',
    })

    expect(result.ok).toBe(true)
    expect(result.dataByTable).toEqual({
      user: { email: 'a@example.com' },
      profile: { userId: 1, bio: 'Hello' },
    })
    expect((result as Record<string, unknown>).data).toBeUndefined()
  })
})
