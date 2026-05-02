import { describe, expect, test } from 'bun:test'

import type { FieldDef, Foul } from '@umpire/core'
import { enabledWhen, umpire } from '@umpire/core'
import { checkCreate, checkPatch } from '@umpire/write'
import { pgTable, serial, text } from 'drizzle-orm/pg-core'

import { fromDrizzleTable } from '../src/table.js'
import {
  combineDrizzleWriteResult,
  runValidationAdapter,
  type UmpireValidationAdapter,
} from '../src/result.js'

const users = pgTable('users', {
  id: serial().primaryKey(),
  email: text().notNull(),
  displayName: text(),
})

const base = fromDrizzleTable(users)
const ump = umpire(base)

function makeMockAdapter<F extends Record<string, FieldDef>>(
  errors: Array<{ field: string; message: string }>,
): UmpireValidationAdapter<F> {
  return {
    run() {
      return {
        errors: Object.fromEntries(
          errors.map((e) => [e.field, e.message]),
        ) as Partial<Record<keyof F & string, string>>,
        normalizedErrors: errors,
        result: { success: false },
        schemaFields: Object.keys(base.fields) as Array<keyof F & string>,
      }
    },
  }
}

describe('runValidationAdapter', () => {
  test('returns undefined when no adapter is supplied', () => {
    const result = runValidationAdapter(undefined, {} as never, {})
    expect(result).toBeUndefined()
  })

  test('maps adapter errors into schemaIssues', () => {
    const adapter = makeMockAdapter([
      { field: 'email', message: 'Invalid email' },
      { field: 'displayName', message: 'Too short' },
    ])
    const write = checkCreate(ump, {
      email: 'bad-email',
      displayName: 'x',
    })

    const result = runValidationAdapter(
      adapter,
      write.availability,
      write.candidate,
    )

    expect(result).toBeDefined()
    expect(result!.schemaIssues).toEqual([
      { field: 'email', message: 'Invalid email' },
      { field: 'displayName', message: 'Too short' },
    ])
    expect(result!.validationResult).toEqual({ success: false })
  })

  test('returns empty schemaIssues when adapter reports no errors', () => {
    const adapter = makeMockAdapter([])
    const write = checkCreate(ump, { email: 'a@example.com' })

    const result = runValidationAdapter(
      adapter,
      write.availability,
      write.candidate,
    )

    expect(result!.schemaIssues).toEqual([])
  })
})

describe('combineDrizzleWriteResult', () => {
  test('maps column shaping failures to issues.columns', () => {
    const write = checkCreate(ump, { email: 'a@example.com' })
    const columnIssues = [
      {
        kind: 'unknown' as const,
        field: 'extraField',
        message: 'unknown field',
      },
      {
        kind: 'nonWritable' as const,
        field: 'id' as const,
        message: '"id" is not writable',
      },
    ]

    const result = combineDrizzleWriteResult({
      write,
      columnIssues,
      validation: undefined,
      data: { email: 'a@example.com' },
      debug: {},
    })

    expect(result.ok).toBe(false)
    expect(result.issues.columns).toEqual(columnIssues)
    expect(result.data).toEqual({ email: 'a@example.com' })
  })

  test('maps write.issues to issues.rules', () => {
    const write = checkCreate(ump, {})
    expect(write.issues.length).toBeGreaterThan(0)

    const result = combineDrizzleWriteResult({
      write,
      columnIssues: [],
      validation: undefined,
      data: {},
      debug: {},
    })

    expect(result.issues.rules).toEqual(write.issues)
    expect(result.ok).toBe(false)
  })

  test('maps write.fouls to issues.rules entries with kind: foul', () => {
    const foulUmp = umpire({
      fields: base.fields,
      rules: [enabledWhen('displayName', (values) => values.email !== '')],
    })

    const write = checkPatch(
      foulUmp,
      { email: 'a@example.com', displayName: 'Alex' },
      { email: '' },
    )

    const result = combineDrizzleWriteResult({
      write,
      columnIssues: [],
      validation: undefined,
      data: { email: '' },
      debug: {},
    })

    const foulIssues = result.issues.rules.filter((i) => i.kind === 'foul')
    expect(foulIssues.length).toBeGreaterThan(0)

    for (const issue of foulIssues) {
      expect(issue.kind).toBe('foul')
      expect(issue).toHaveProperty('field')
      expect(issue).toHaveProperty('message')
      expect(issue).toHaveProperty('foul')
    }
  })

  test('stores write.candidate under debug.candidate, not top-level candidate', () => {
    const write = checkCreate(ump, { email: 'a@example.com' })

    const result = combineDrizzleWriteResult({
      write,
      columnIssues: [],
      validation: undefined,
      data: { email: 'a@example.com' },
      debug: {},
    })

    expect(result.debug.candidate).toBe(write.candidate)
    expect((result as Record<string, unknown>).candidate).toBeUndefined()
  })

  test('stores validation result under debug.validationResult', () => {
    const adapter = makeMockAdapter([
      { field: 'email', message: 'Invalid email' },
    ])
    const write = checkCreate(ump, { email: 'bad' })

    const validation = runValidationAdapter(
      adapter,
      write.availability,
      write.candidate,
    )

    const result = combineDrizzleWriteResult({
      write,
      columnIssues: [],
      validation,
      data: {},
      debug: {},
    })

    expect(result.debug.validationResult).toEqual({ success: false })
  })

  test('ok is false when any column issue exists', () => {
    const write = checkCreate(ump, { email: 'a@example.com' })
    expect(write.ok).toBe(true)

    const result = combineDrizzleWriteResult({
      write,
      columnIssues: [{ kind: 'unknown', field: 'extra', message: 'unknown' }],
      validation: undefined,
      data: { email: 'a@example.com' },
      debug: {},
    })

    expect(result.ok).toBe(false)
  })

  test('ok is false when validation schema issues exist', () => {
    const write = checkCreate(ump, { email: 'a@example.com' })
    expect(write.ok).toBe(true)

    const result = combineDrizzleWriteResult({
      write,
      columnIssues: [],
      validation: {
        schemaIssues: [{ field: 'email', message: 'Invalid email' }],
        validationResult: { success: false },
      },
      data: { email: 'a@example.com' },
      debug: {},
    })

    expect(result.ok).toBe(false)
    expect(result.issues.schema).toEqual([
      { field: 'email', message: 'Invalid email' },
    ])
  })

  test('ok is true when no issues exist', () => {
    const write = checkCreate(ump, { email: 'a@example.com' })
    expect(write.ok).toBe(true)

    const result = combineDrizzleWriteResult({
      write,
      columnIssues: [],
      validation: undefined,
      data: { email: 'a@example.com' },
      debug: {},
    })

    expect(result.ok).toBe(true)
  })

  test('no top-level write, validation, candidate, or errors field exposed', () => {
    const write = checkCreate(ump, { email: 'a@example.com' })

    const result = combineDrizzleWriteResult({
      write,
      columnIssues: [],
      validation: undefined,
      data: { email: 'a@example.com' },
      debug: {},
    })

    const r = result as Record<string, unknown>
    expect(r.write).toBeUndefined()
    expect(r.validation).toBeUndefined()
    expect(r.candidate).toBeUndefined()
    expect(r.errors).toBeUndefined()
  })

  test('column failure and schema failure can appear together', () => {
    const write = checkCreate(ump, { email: 'a@example.com' })

    const result = combineDrizzleWriteResult({
      write,
      columnIssues: [{ kind: 'unknown', field: 'extra', message: 'unknown' }],
      validation: {
        schemaIssues: [{ field: 'email', message: 'Invalid email' }],
        validationResult: { success: false },
      },
      data: { email: 'a@example.com' },
      debug: {},
    })

    expect(result.ok).toBe(false)
    expect(result.issues.columns).toHaveLength(1)
    expect(result.issues.schema).toHaveLength(1)
  })
})
