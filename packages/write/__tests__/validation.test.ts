import { describe, expect, test } from 'bun:test'

import { enabledWhen, umpire, type FieldDef } from '@umpire/core'
import {
  checkCreate,
  checkPatch,
  composeWriteResult,
  flattenFieldErrorPaths,
  nestNamespacedValues,
  runWriteValidationAdapter,
  type WriteValidationAdapter,
} from '@umpire/write'

type TestFields = {
  email: FieldDef
  name: FieldDef
  toggle: FieldDef
  dependent: FieldDef
}

function makeMockAdapter<F extends Record<string, FieldDef>>(
  errors: Array<{ field: string; message: string }>,
): WriteValidationAdapter<F> {
  return {
    run(_availability, _values) {
      return {
        errors: Object.fromEntries(
          errors.map((e) => [e.field, e.message]),
        ) as Partial<Record<keyof F & string, string>>,
        normalizedErrors: errors,
        result: { success: false },
        schemaFields: (errors.length > 0
          ? errors.map((e) => e.field)
          : []) as Array<keyof F & string>,
      }
    },
  }
}

describe('composeWriteResult', () => {
  test('no validation adapter returns only rule issues', () => {
    const ump = umpire<Pick<TestFields, 'email' | 'name'>>({
      fields: { email: { required: true }, name: {} },
      rules: [],
    })

    const write = checkCreate(ump, { email: 'a@example.com' })
    const result = composeWriteResult({ write })

    expect(result.issues.rules).toEqual(write.issues)
    expect(result.issues.schema).toEqual([])
    expect(result.ok).toBe(true)
  })

  test('validation adapter errors become issues.schema', () => {
    const ump = umpire<Pick<TestFields, 'email' | 'name'>>({
      fields: { email: { required: true }, name: {} },
      rules: [],
    })

    const write = checkCreate(ump, { email: 'a@example.com' })
    const adapter = makeMockAdapter<Pick<TestFields, 'email' | 'name'>>([
      { field: 'email', message: 'invalid format' },
    ])
    const validation = runWriteValidationAdapter(
      adapter,
      write.availability,
      write.candidate,
    )
    const result = composeWriteResult({ write, validation })

    expect(result.issues.schema).toEqual([
      { field: 'email', message: 'invalid format' },
    ])
    expect(result.ok).toBe(false)
  })

  test('fouls become issues.rules with kind: foul', () => {
    const ump = umpire<Pick<TestFields, 'toggle' | 'dependent'>>({
      fields: { toggle: {}, dependent: {} },
      rules: [enabledWhen('dependent', (values) => values.toggle === true)],
    })

    const write = checkPatch(
      ump,
      { toggle: true, dependent: 'keep me' },
      { toggle: false },
    )

    expect(write.fouls).toHaveLength(1)

    const result = composeWriteResult({ write })

    expect(result.issues.rules).toEqual([
      ...write.issues,
      {
        kind: 'foul',
        field: write.fouls[0].field,
        message: write.fouls[0].reason,
        foul: write.fouls[0],
      },
    ])
  })

  test('extra issue groups affect ok', () => {
    const ump = umpire<Pick<TestFields, 'email' | 'name'>>({
      fields: { email: { required: true }, name: {} },
      rules: [],
    })

    const write = checkCreate(ump, { email: 'a@example.com' })
    const result = composeWriteResult({
      write,
      extraIssues: { custom: ['something went wrong'] as const },
    })

    expect(result.ok).toBe(false)
    expect(result.issues.custom).toEqual(['something went wrong'])
  })

  test('debug candidate is present', () => {
    const ump = umpire<Pick<TestFields, 'email' | 'name'>>({
      fields: { email: { required: true }, name: {} },
      rules: [],
    })

    const write = checkCreate(ump, { email: 'a@example.com' })
    const result = composeWriteResult({ write })

    expect(result.debug.candidate).toEqual(write.candidate)
  })

  test('raw validation result is under debug only', () => {
    const ump = umpire<Pick<TestFields, 'email' | 'name'>>({
      fields: { email: { required: true }, name: {} },
      rules: [],
    })

    const write = checkCreate(ump, { email: 'a@example.com' })
    const adapter = makeMockAdapter<Pick<TestFields, 'email' | 'name'>>([
      { field: 'email', message: 'bad' },
    ])
    const validation = runWriteValidationAdapter(
      adapter,
      write.availability,
      write.candidate,
    )
    const result = composeWriteResult({ write, validation })

    expect(result.debug.validationResult).toEqual({ success: false })
    expect('validationResult' in result).toBe(false)
  })

  test('preserves falsy-but-defined validationResult', () => {
    const ump = umpire<Pick<TestFields, 'email' | 'name'>>({
      fields: { email: { required: true }, name: {} },
      rules: [],
    })

    const write = checkCreate(ump, { email: 'a@example.com' })
    const validation = {
      schemaIssues: [],
      validationResult: false as const,
    }
    const result = composeWriteResult({ write, validation })

    expect(result.debug.validationResult).toBe(false)
  })

  test('no top-level write, validation, candidate, or errors', () => {
    const ump = umpire<Pick<TestFields, 'email' | 'name'>>({
      fields: { email: { required: true }, name: {} },
      rules: [],
    })

    const write = checkCreate(ump, { email: 'a@example.com' })
    const result = composeWriteResult({ write })

    expect('write' in result).toBe(false)
    expect('validation' in result).toBe(false)
    expect('candidate' in result).toBe(false)
    expect('errors' in result).toBe(false)
  })

  test('column and schema failure can appear together', () => {
    const ump = umpire<Pick<TestFields, 'email' | 'name'>>({
      fields: { email: { required: true }, name: {} },
      rules: [],
    })

    const write = checkCreate(ump, { email: 'a@example.com' })
    const adapter = makeMockAdapter<Pick<TestFields, 'email' | 'name'>>([
      { field: 'name', message: 'too short' },
    ])
    const validation = runWriteValidationAdapter(
      adapter,
      write.availability,
      write.candidate,
    )
    const result = composeWriteResult({
      write,
      validation,
      extraIssues: { custom: ['db error'] as const },
    })

    expect(result.issues.schema).toEqual([
      { field: 'name', message: 'too short' },
    ])
    expect(result.issues.custom).toEqual(['db error'])
    expect(result.ok).toBe(false)
  })

  test('ok is true when no issues exist', () => {
    const ump = umpire<Pick<TestFields, 'email'>>({
      fields: { email: { required: true } },
      rules: [],
    })

    const write = checkCreate(ump, { email: 'test@example.com' })
    const result = composeWriteResult({ write })

    expect(result.ok).toBe(true)
    expect(result.issues.rules).toEqual([])
    expect(result.issues.schema).toEqual([])
  })
})

describe('runWriteValidationAdapter', () => {
  test('returns undefined when no adapter', () => {
    const ump = umpire<Pick<TestFields, 'email'>>({
      fields: { email: { required: true } },
      rules: [],
    })

    const write = checkCreate(ump, { email: 'a@example.com' })
    const result = runWriteValidationAdapter(
      undefined,
      write.availability,
      write.candidate,
    )

    expect(result).toBeUndefined()
  })

  test('returns empty schemaIssues when adapter reports no errors', () => {
    const ump = umpire<Pick<TestFields, 'email'>>({
      fields: { email: { required: true } },
      rules: [],
    })

    const write = checkCreate(ump, { email: 'a@example.com' })
    const adapter = makeMockAdapter<Pick<TestFields, 'email'>>([])
    const result = runWriteValidationAdapter(
      adapter,
      write.availability,
      write.candidate,
    )

    expect(result?.schemaIssues).toEqual([])
    expect(result?.validationResult).toEqual({ success: false })
  })
})

describe('namespaced validation helpers', () => {
  test('nests flat dotted values for composed validators', () => {
    expect(
      nestNamespacedValues({
        'account.email': 'a@example.com',
        'account.companyName': 'Acme',
        'shipment.hazardous': false,
        status: 'draft',
      }),
    ).toEqual({
      account: {
        email: 'a@example.com',
        companyName: 'Acme',
      },
      shipment: {
        hazardous: false,
      },
      status: 'draft',
    })
  })

  test('flattens normalized validation paths back to dotted fields', () => {
    expect(
      flattenFieldErrorPaths([
        {
          field: 'account',
          path: ['account', 'companyName'],
          message: 'Company name is required',
        },
      ]),
    ).toEqual([
      {
        field: 'account.companyName',
        path: ['account', 'companyName'],
        message: 'Company name is required',
      },
    ])
  })
})

describe('composeWriteResult extraDebug', () => {
  test('extraDebug is preserved', () => {
    const ump = umpire<Pick<TestFields, 'email'>>({
      fields: { email: { required: true } },
      rules: [],
    })

    const write = checkCreate(ump, { email: 'a@example.com' })
    const result = composeWriteResult({
      write,
      debug: { requestId: 'abc-123', source: 'api' },
    })

    expect(result.debug.requestId).toBe('abc-123')
    expect(result.debug.source).toBe('api')
  })
})
