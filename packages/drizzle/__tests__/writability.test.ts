import { describe, expect, test } from 'bun:test'

import { umpire } from '@umpire/core'
import { checkCreate, checkPatch } from '@umpire/write'
import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

import { fromDrizzleTable, getTableColumnsMeta } from '../src/table.js'
import {
  buildCreateDataFromCandidate,
  shapeCreateInput,
  shapePatchData,
} from '../src/writability.js'

const users = pgTable('users', {
  id: serial().primaryKey(),
  email: varchar({ length: 255 }).notNull(),
  displayName: text(),
  role: text().notNull().default('user'),
  retries: integer().notNull().default(3),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp()
    .notNull()
    .$onUpdate(() => new Date()),
})

const tableMeta = getTableColumnsMeta(users)
const exclude = new Set<string>(['createdAt'])

describe('shapeCreateInput', () => {
  test('rejects primary key input', () => {
    const { shapedData, columnIssues } = shapeCreateInput(tableMeta, exclude, {
      id: 1,
      email: 'a@example.com',
    })

    expect(shapedData).toEqual({ email: 'a@example.com' })
    expect(columnIssues).toEqual([
      { kind: 'nonWritable', field: 'id', message: '"id" is not writable' },
    ])
  })

  test('strips primary key input with nonWritableKeys: strip', () => {
    const { shapedData, columnIssues } = shapeCreateInput(
      tableMeta,
      exclude,
      { id: 1, email: 'a@example.com' },
      { nonWritableKeys: 'strip' },
    )

    expect(shapedData).toEqual({ email: 'a@example.com' })
    expect(columnIssues).toEqual([])
  })

  test('rejects unknown keys by default', () => {
    const { shapedData, columnIssues } = shapeCreateInput(tableMeta, exclude, {
      email: 'a@example.com',
      extraField: 'value',
    })

    expect(shapedData).toEqual({ email: 'a@example.com' })
    expect(columnIssues).toEqual([
      {
        kind: 'unknown',
        field: 'extraField',
        message: 'unknown field "extraField"',
      },
    ])
  })

  test('strips unknown keys with unknownKeys: strip', () => {
    const { shapedData, columnIssues } = shapeCreateInput(
      tableMeta,
      exclude,
      { email: 'a@example.com', extraField: 'value' },
      { unknownKeys: 'strip' },
    )

    expect(shapedData).toEqual({ email: 'a@example.com' })
    expect(columnIssues).toEqual([])
  })

  test('rejects excluded column input', () => {
    const { shapedData, columnIssues } = shapeCreateInput(tableMeta, exclude, {
      email: 'a@example.com',
      createdAt: new Date(),
    })

    expect(shapedData).toEqual({ email: 'a@example.com' })
    expect(columnIssues).toEqual([
      {
        kind: 'nonWritable',
        field: 'createdAt',
        message: '"createdAt" is not writable',
      },
    ])
  })

  test('strips excluded column input with nonWritableKeys: strip', () => {
    const { shapedData, columnIssues } = shapeCreateInput(
      tableMeta,
      exclude,
      { email: 'a@example.com', createdAt: new Date() },
      { nonWritableKeys: 'strip' },
    )

    expect(shapedData).toEqual({ email: 'a@example.com' })
    expect(columnIssues).toEqual([])
  })

  test('allows writable columns through unchanged', () => {
    const { shapedData, columnIssues } = shapeCreateInput(tableMeta, exclude, {
      email: 'a@example.com',
      displayName: 'Alex',
      role: 'admin',
    })

    expect(shapedData).toEqual({
      email: 'a@example.com',
      displayName: 'Alex',
      role: 'admin',
    })
    expect(columnIssues).toEqual([])
  })
})

describe('shapePatchData', () => {
  test('rejects primary key input', () => {
    const { shapedData, columnIssues } = shapePatchData(tableMeta, exclude, {
      id: 1,
      email: 'a@example.com',
    })

    expect(shapedData).toEqual({ email: 'a@example.com' })
    expect(columnIssues).toEqual([
      { kind: 'nonWritable', field: 'id', message: '"id" is not writable' },
    ])
  })

  test('strips primary key input with nonWritableKeys: strip', () => {
    const { shapedData, columnIssues } = shapePatchData(
      tableMeta,
      exclude,
      { id: 1, email: 'a@example.com' },
      { nonWritableKeys: 'strip' },
    )

    expect(shapedData).toEqual({ email: 'a@example.com' })
    expect(columnIssues).toEqual([])
  })

  test('rejects unknown keys by default', () => {
    const { shapedData, columnIssues } = shapePatchData(tableMeta, exclude, {
      email: 'new@example.com',
      extraField: 'value',
    })

    expect(shapedData).toEqual({ email: 'new@example.com' })
    expect(columnIssues).toEqual([
      {
        kind: 'unknown',
        field: 'extraField',
        message: 'unknown field "extraField"',
      },
    ])
  })

  test('strips unknown keys with unknownKeys: strip', () => {
    const { shapedData, columnIssues } = shapePatchData(
      tableMeta,
      exclude,
      { email: 'new@example.com', extraField: 'value' },
      { unknownKeys: 'strip' },
    )

    expect(shapedData).toEqual({ email: 'new@example.com' })
    expect(columnIssues).toEqual([])
  })

  test('rejects update-managed column input in patch', () => {
    const { shapedData, columnIssues } = shapePatchData(tableMeta, exclude, {
      email: 'a@example.com',
      updatedAt: new Date(),
    })

    expect(shapedData).toEqual({ email: 'a@example.com' })
    expect(columnIssues).toEqual([
      {
        kind: 'nonWritable',
        field: 'updatedAt',
        message: '"updatedAt" is not writable',
      },
    ])
  })

  test('result data is patch-shaped (only accepted keys)', () => {
    const { shapedData, columnIssues } = shapePatchData(tableMeta, exclude, {
      email: 'new@example.com',
      displayName: 'New Name',
    })

    expect(Object.keys(shapedData)).toEqual(['email', 'displayName'])
    expect(columnIssues).toEqual([])
  })
})

describe('buildCreateDataFromCandidate', () => {
  test('includes writable Umpire defaults after candidate merge', () => {
    const base = fromDrizzleTable(users)
    const ump = umpire(base)
    const write = checkCreate(ump, { email: 'a@example.com' })

    const data = buildCreateDataFromCandidate(
      tableMeta,
      exclude,
      write.candidate,
      { email: 'a@example.com' },
    )

    expect(data.email).toBe('a@example.com')
    expect(data.role).toBe('user')
    expect(data.retries).toBe(3)
  })

  test('includes static Drizzle defaults copied into Umpire defaults', () => {
    const base = fromDrizzleTable(users)
    const ump = umpire(base)
    const write = checkCreate(ump, {})

    const data = buildCreateDataFromCandidate(
      tableMeta,
      exclude,
      write.candidate,
      {},
    )

    expect(data.role).toBe('user')
    expect(data.retries).toBe(3)
  })

  test('omits runtime database defaults from omitted fields', () => {
    const base = fromDrizzleTable(users)
    const ump = umpire(base)
    const write = checkCreate(ump, { email: 'a@example.com' })

    const data = buildCreateDataFromCandidate(
      tableMeta,
      exclude,
      write.candidate,
      { email: 'a@example.com' },
    )

    expect(data.createdAt).toBeUndefined()
    expect(data.updatedAt).toBeUndefined()
  })

  test('includes user-supplied values even with runtime defaults', () => {
    const now = new Date()
    const base = fromDrizzleTable(users)
    const ump = umpire(base)
    const write = checkCreate(ump, {
      email: 'a@example.com',
      createdAt: now,
    })

    const data = buildCreateDataFromCandidate(
      tableMeta,
      exclude,
      write.candidate,
      { email: 'a@example.com', createdAt: now },
    )

    expect(data.email).toBe('a@example.com')
    expect(data.createdAt).toBe(now)
  })

  test('omits non-writable fields from candidate', () => {
    const base = fromDrizzleTable(users)
    const ump = umpire(base)
    const write = checkCreate(ump, {
      email: 'a@example.com',
      id: 5,
    })

    const data = buildCreateDataFromCandidate(
      tableMeta,
      exclude,
      write.candidate,
      { email: 'a@example.com' },
    )

    expect(data.email).toBe('a@example.com')
    expect(data.id).toBeUndefined()
    expect(data.updatedAt).toBeUndefined()
  })
})
