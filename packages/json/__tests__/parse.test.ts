import { umpire } from '@umpire/core'

import { fromJson, getJsonDef, toJson, validateSchema } from '../src/index.js'
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
