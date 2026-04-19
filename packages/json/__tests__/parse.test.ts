import { umpire } from '@umpire/core'

import { fromJson, fromJsonSafe, getJsonDef, parseJsonSchema, toJson, validateSchema } from '../src/index.js'
import type { UmpireJsonSchema } from '../src/index.js'

describe('fromJson', () => {
  test('hydrates fields, check rules, and DSL-backed rules into core config', () => {
    const schema: UmpireJsonSchema = {
      version: 1,
      conditions: {
        isBusiness: { type: 'boolean' },
        validPlans: { type: 'string[]' },
      },
      fields: {
        companyName: {},
        planId: {},
        email: { isEmpty: 'string' },
        settings: { isEmpty: 'object' },
      },
      rules: [
        {
          type: 'requires',
          field: 'companyName',
          when: { op: 'cond', condition: 'isBusiness' },
          reason: 'Company name is required for business accounts',
        },
        {
          type: 'fairWhen',
          field: 'planId',
          when: { op: 'fieldInCond', field: 'planId', condition: 'validPlans' },
          reason: 'Selected plan is not available for this account',
        },
        {
          type: 'check',
          field: 'email',
          op: 'email',
        },
      ],
    }

    const { fields, rules } = fromJson(schema)
    const runtime = umpire({ fields, rules })

    expect(fields.email.isEmpty?.('')).toBe(true)
    expect(fields.email.isEmpty?.('a')).toBe(false)
    expect(fields.settings.isEmpty?.({})).toBe(true)
    expect(fields.settings.isEmpty?.({ theme: 'dark' })).toBe(false)

    expect(
      runtime.check(
        { email: 'invalid', planId: 'starter' },
        { isBusiness: false, validPlans: ['pro'] },
      ),
    ).toMatchObject({
      companyName: {
        enabled: false,
        reason: 'Company name is required for business accounts',
      },
      planId: {
        enabled: true,
        fair: false,
        reason: 'Selected plan is not available for this account',
      },
      email: {
        enabled: true,
        fair: false,
        reason: 'Must be a valid email address',
      },
    })

    expect(getJsonDef(rules[0])).toEqual(schema.rules[0])
    expect(getJsonDef(rules[1])).toEqual(schema.rules[1])
    expect(getJsonDef(rules[2])).toEqual(schema.rules[2])
  })

  test('hydrates validators into core config and surfaces validation metadata', () => {
    const schema: UmpireJsonSchema = {
      version: 1,
      fields: {
        email: { isEmpty: 'string' },
      },
      rules: [],
      validators: {
        email: {
          op: 'email',
          error: 'Must be a valid email address',
        },
      },
    }

    const parsed = fromJson(schema)
    const runtime = umpire(parsed)

    expect(runtime.check({ email: '' })).toMatchObject({
      email: {
        enabled: true,
        fair: true,
        required: false,
      },
    })
    expect(runtime.check({ email: '' }).email.valid).toBeUndefined()
    expect(runtime.check({ email: '' }).email.error).toBeUndefined()

    expect(runtime.check({ email: 'invalid' })).toMatchObject({
      email: {
        enabled: true,
        fair: true,
        required: false,
        valid: false,
        error: 'Must be a valid email address',
      },
    })

    expect(parsed.validators.email).toBeDefined()
    expect(toJson(parsed)).toEqual(schema)
  })

  test('rejects unknown isEmpty strategies', () => {
    expect(() =>
      fromJson({
        version: 1,
        fields: {
          notes: {
            isEmpty: '__unserializable__' as never,
          },
        },
        rules: [],
      }),
    ).toThrow('Unknown isEmpty strategy')
  })

  test('round-trips fairWhen check expressions without dropping portable-validator metadata', () => {
    const schema: UmpireJsonSchema = {
      version: 1,
      fields: {
        email: {},
        submit: {},
      },
      rules: [
        {
          type: 'fairWhen',
          field: 'submit',
          when: {
            op: 'check',
            field: 'email',
            check: { op: 'email' },
          },
          reason: 'Submit stays foul until the scorer email is valid',
        },
      ],
    }

    const parsed = fromJson(schema)

    expect(toJson(parsed)).toEqual(schema)
  })
})

describe('parseJsonSchema', () => {
  test('returns ok for a valid raw schema object', () => {
    const raw: unknown = {
      version: 1,
      fields: {
        email: { isEmpty: 'string' },
      },
      rules: [],
      validators: {
        email: { op: 'email', error: 'Must be a valid email address' },
      },
    }

    const parsed = parseJsonSchema(raw)

    expect(parsed.ok).toBe(true)

    if (!parsed.ok) {
      throw new Error('Expected parseJsonSchema to succeed')
    }

    expect(parsed.schema).toEqual(raw)
  })

  test('returns errors for invalid schema input', () => {
    const parsed = parseJsonSchema({
      version: 1,
      fields: {},
      rules: [
        {
          type: 'requires',
          field: 'missing',
          dependency: 'alsoMissing',
        },
      ],
    })

    expect(parsed).toEqual({
      ok: false,
      errors: ['[@umpire/json] Rule "requires" references unknown field "missing"'],
    })
  })

  test.each([
    [null, '[@umpire/json] Schema must be an object'],
    [{ version: 1 }, '[@umpire/json] Schema must include a "fields" object'],
    [{ version: 1, fields: [], rules: [] }, '[@umpire/json] Schema must include a "fields" object'],
    [{ version: 1, fields: {}, rules: null }, '[@umpire/json] Schema must include a "rules" array'],
    [{ version: 1, fields: {}, rules: [], validators: 'nope' }, '[@umpire/json] Schema "validators" must be an object when provided'],
    [{ version: 1, fields: {}, rules: [], validators: [] }, '[@umpire/json] Schema "validators" must be an object when provided'],
    [{ version: 2, fields: {}, rules: [] }, '[@umpire/json] Unsupported schema version "2"'],
    [{ fields: {}, rules: [] }, '[@umpire/json] Schema must include a "version" field'],
  ])('returns boundary errors for malformed raw schemas: %j', (raw, message) => {
    expect(parseJsonSchema(raw)).toEqual({
      ok: false,
      errors: [message],
    })
  })
})

describe('fromJsonSafe', () => {
  test('returns hydrated config when given a valid raw schema object', () => {
    const raw: unknown = {
      version: 1,
      fields: {
        email: { isEmpty: 'string' },
      },
      rules: [],
      validators: {
        email: { op: 'email', error: 'Must be a valid email address' },
      },
    }

    const parsed = fromJsonSafe(raw)

    expect(parsed.ok).toBe(true)

    if (!parsed.ok) {
      throw new Error('Expected fromJsonSafe to succeed')
    }

    const runtime = umpire({ fields: parsed.fields, rules: parsed.rules, validators: parsed.validators })
    expect(runtime.check({ email: 'invalid' }).email.valid).toBe(false)
    expect(parsed.schema).toEqual(raw)
  })

  test('returns errors for invalid schema input', () => {
    const parsed = fromJsonSafe({
      version: 1,
      fields: {},
      rules: [
        {
          type: 'requires',
          field: 'missing',
          dependency: 'alsoMissing',
        },
      ],
    })

    expect(parsed).toEqual({
      ok: false,
      errors: ['[@umpire/json] Rule "requires" references unknown field "missing"'],
    })
  })

  test.each([
    [
      {
        version: 1,
        fields: [],
        rules: [],
      },
      '[@umpire/json] Schema must include a "fields" object',
    ],
    [
      {
        version: 1,
        fields: { email: null },
        rules: [],
      },
      '[@umpire/json] Field "email" definition must be an object',
    ],
    [
      {
        version: 1,
        fields: { email: {} },
        rules: [],
        validators: { email: null },
      },
      '[@umpire/json] Validator for field "email" must be an object',
    ],
    [
      {
        version: 1,
        fields: {},
        rules: [],
        validators: [],
      },
      '[@umpire/json] Schema "validators" must be an object when provided',
    ],
    [
      {
        version: 1,
        fields: {},
        rules: [],
        conditions: [],
      },
      '[@umpire/json] Schema "conditions" must be an object when provided',
    ],
    [
      {
        version: 1,
        fields: {},
        rules: [],
        excluded: {},
      },
      '[@umpire/json] Schema "excluded" must be an array when provided',
    ],
  ])('returns boundary errors for malformed schema sections: %j', (raw, message) => {
    expect(fromJsonSafe(raw)).toEqual({
      ok: false,
      errors: [message],
    })
  })

  test('matches fromJson output shape and behavior for valid schemas', () => {
    const schema: UmpireJsonSchema = {
      version: 1,
      fields: {
        accountType: { isEmpty: 'string' },
        companyName: { isEmpty: 'string' },
        email: { isEmpty: 'string' },
      },
      rules: [
        {
          type: 'enabledWhen',
          field: 'companyName',
          when: { op: 'eq', field: 'accountType', value: 'business' },
          reason: 'Business accounts only',
        },
      ],
      validators: {
        email: { op: 'email', error: 'Must be a valid email address' },
      },
    }

    const safe = fromJsonSafe(schema)
    const typed = fromJson(schema)

    expect(safe.ok).toBe(true)

    if (!safe.ok) {
      throw new Error('Expected fromJsonSafe to succeed')
    }

    const safeRuntime = umpire({ fields: safe.fields, rules: safe.rules, validators: safe.validators })
    const typedRuntime = umpire(typed)

    const values = {
      accountType: 'business',
      companyName: '',
      email: 'invalid',
    }

    expect(Object.keys(safe.fields)).toEqual(Object.keys(typed.fields))
    expect(toJson({ fields: safe.fields, rules: safe.rules, validators: safe.validators })).toEqual(
      toJson(typed),
    )
    expect(safeRuntime.check(values)).toEqual(typedRuntime.check(values))
  })
})

describe('validateSchema', () => {
  test('throws descriptively for invalid references and invalid regex patterns', () => {
    expect(() =>
      validateSchema({
        version: 1,
        fields: {
          email: {},
        },
        rules: [
          {
            type: 'requires',
            field: 'email',
            when: { op: 'cond', condition: 'missing' },
          },
        ],
      }),
    ).toThrow('Unknown condition "missing"')

    expect(() =>
      validateSchema({
        version: 1,
        fields: {
          email: {},
        },
        rules: [
          {
            type: 'check',
            field: 'email',
            op: 'matches',
            pattern: '[',
          },
        ],
      }),
    ).toThrow('Invalid regex pattern')

    expect(() =>
      validateSchema({
        version: 1,
        fields: {},
        rules: [],
        validators: {
          email: {
            op: 'email',
          },
        },
      }),
    ).toThrow('Validator references unknown field "email"')
  })
})
