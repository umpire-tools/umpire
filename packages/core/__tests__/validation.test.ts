import { describe, expect, spyOn, test } from 'bun:test'
import { enabledWhen } from '../src/rules.js'
import {
  normalizeValidationEntry,
  runFieldValidator,
  runValidationEntry,
} from '../src/validation.js'
import { umpire } from '../src/umpire.js'

describe('surface validation metadata', () => {
  test('normalizes supported validation entries and rejects unsupported ones', () => {
    expect(
      normalizeValidationEntry((value: string) => value === 'ok'),
    ).toMatchObject({
      validate: expect.any(Function),
    })
    expect(
      normalizeValidationEntry({
        validator: {
          safeParse: (value: unknown) => ({ success: value === 'ok' }),
        },
        error: 'Bad value',
      }),
    ).toMatchObject({
      validate: expect.any(Function),
      error: 'Bad value',
    })
    expect(normalizeValidationEntry({ validator: { nope: true } })).toBeNull()
  })

  test('runs field validators and normalized validation entries', () => {
    expect(runFieldValidator((value: string) => value === 'ok', 'ok')).toBe(
      true,
    )
    expect(
      runFieldValidator(
        { test: (value: string) => value.length > 0 },
        42 as never,
      ),
    ).toBe(false)

    expect(
      runValidationEntry(
        {
          validate: (value: string) => value === 'ok',
          error: 'Fallback',
        },
        'bad',
      ),
    ).toEqual({ valid: false, error: 'Fallback' })

    expect(
      runValidationEntry(
        {
          validate: () => ({ valid: false, error: undefined }),
        },
        'bad',
      ),
    ).toEqual({ valid: false })

    expect(
      runValidationEntry(
        {
          validate: () => ({ valid: false }),
          error: 'Fallback',
        },
        'bad',
      ),
    ).toEqual({ valid: false, error: 'Fallback' })
  })

  test.each([
    ['function', (value: string) => value === 'ok'],
    [
      'named check',
      {
        __check: 'equalsOk',
        validate: (value: string) => value === 'ok',
      },
    ],
    [
      'safeParse',
      {
        safeParse: (value: unknown) => ({ success: value === 'ok' }),
      },
    ],
    [
      'test',
      {
        test: (value: string) => value === 'ok',
      },
    ],
  ])(
    'supports %s validator shapes in validators config',
    (_label, validator) => {
      const ump = umpire({
        fields: {
          alpha: { required: true, isEmpty: (value: unknown) => !value },
        },
        rules: [],
        validators: {
          alpha: validator,
        },
      })

      expect(ump.check({ alpha: 'ok' }).alpha).toMatchObject({
        enabled: true,
        fair: true,
        required: true,
        valid: true,
      })

      expect(ump.check({ alpha: 'nope' }).alpha).toMatchObject({
        enabled: true,
        fair: true,
        required: true,
        valid: false,
      })
      expect(ump.check({ alpha: 'nope' }).alpha.error).toBeUndefined()
    },
  )

  test('surfaces configured validation errors for failing validators', () => {
    const ump = umpire({
      fields: {
        email: { required: true, isEmpty: (value: unknown) => !value },
      },
      rules: [],
      validators: {
        email: {
          validator: {
            safeParse: (value: unknown) => ({
              success: value === 'ok@example.com',
            }),
          },
          error: 'Must be a valid email address',
        },
      },
    })

    expect(ump.check({ email: 'bad' }).email).toMatchObject({
      enabled: true,
      fair: true,
      required: true,
      valid: false,
      error: 'Must be a valid email address',
    })
    expect(ump.check({ email: 'ok@example.com' }).email).toMatchObject({
      valid: true,
    })
    expect(ump.check({ email: 'ok@example.com' }).email.error).toBeUndefined()
  })

  test('supports validators that return normalized validation results', () => {
    const ump = umpire({
      fields: {
        username: { required: true, isEmpty: (value: unknown) => !value },
      },
      rules: [],
      validators: {
        username: (value: string) =>
          value === 'doug'
            ? { valid: true }
            : { valid: false, error: 'Username is taken' },
      },
    })

    expect(ump.check({ username: 'doug' }).username).toMatchObject({
      valid: true,
    })
    expect(ump.check({ username: 'alice' }).username).toMatchObject({
      valid: false,
      error: 'Username is taken',
    })
  })

  test('ignores undefined validator entries while still validating configured fields', () => {
    const ump = umpire({
      fields: {
        username: { required: true, isEmpty: (value: unknown) => !value },
        email: { required: true, isEmpty: (value: unknown) => !value },
      },
      rules: [],
      validators: {
        username: undefined,
        email: (value: string) => value.includes('@'),
      },
    })

    expect(
      ump.check({ username: 'alice', email: 'alice' }).username.valid,
    ).toBe(undefined)
    expect(
      ump.check({ username: 'alice', email: 'alice' }).email,
    ).toMatchObject({
      valid: false,
    })
  })

  test('uses wrapped validation errors as a fallback for normalized validator results', () => {
    const ump = umpire({
      fields: {
        username: { required: true, isEmpty: (value: unknown) => !value },
      },
      rules: [],
      validators: {
        username: {
          validator: (value: string) => ({ valid: value === 'doug' }),
          error: 'Username is invalid',
        },
      },
    })

    expect(ump.check({ username: 'alice' }).username).toMatchObject({
      valid: false,
      error: 'Username is invalid',
    })
  })

  test('warns in development when a validation function returns an unsupported result', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const ump = umpire({
        fields: {
          username: { required: true, isEmpty: (value: unknown) => !value },
        },
        rules: [],
        validators: {
          username: (() => undefined) as never,
        },
      })

      expect(ump.check({ username: 'doug' }).username).toMatchObject({
        valid: false,
      })
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  test('skips validation metadata for disabled fields', () => {
    const ump = umpire({
      fields: {
        companyName: { required: true, isEmpty: (value: unknown) => !value },
      },
      rules: [
        enabledWhen(
          'companyName',
          (_values, conditions: { plan?: string }) =>
            conditions.plan === 'business',
          {
            reason: 'business plan required',
          },
        ),
      ],
      validators: {
        companyName: {
          validator: (value: string) => value.length > 0,
          error: 'Company name is required',
        },
      },
    })

    const result = ump.check({ companyName: 'Acme' }, { plan: 'personal' })

    expect(result.companyName).toMatchObject({
      enabled: false,
      fair: true,
      required: false,
      reason: 'business plan required',
    })
    expect(result.companyName.valid).toBeUndefined()
    expect(result.companyName.error).toBeUndefined()
  })

  test('skips validation metadata until a field has a satisfied value', () => {
    const ump = umpire({
      fields: {
        password: { required: true, isEmpty: (value: unknown) => !value },
      },
      rules: [],
      validators: {
        password: {
          validator: (value: string) => value.length >= 8,
          error: 'At least 8 characters',
        },
      },
    })

    const result = ump.check({ password: '' })

    expect(result.password).toMatchObject({
      enabled: true,
      fair: true,
      required: true,
    })
    expect(result.password.valid).toBeUndefined()
    expect(result.password.error).toBeUndefined()
  })

  test('treats string-test validators as invalid for non-string values', () => {
    const ump = umpire({
      fields: {
        age: {},
      },
      rules: [],
      validators: {
        age: {
          test: (value: string) => value.length > 0,
        },
      },
    })

    expect(ump.check({ age: 42 }).age).toMatchObject({
      enabled: true,
      fair: true,
      required: false,
      valid: false,
    })
    expect(ump.check({ age: 42 }).age.error).toBeUndefined()
  })

  test('mirrors validation metadata into scorecard fields', () => {
    const ump = umpire({
      fields: {
        email: { required: true, isEmpty: (value: unknown) => !value },
      },
      rules: [],
      validators: {
        email: {
          validator: {
            safeParse: (value: unknown) => ({
              success: value === 'ok@example.com',
            }),
          },
          error: 'Must be a valid email address',
        },
      },
    })

    const card = ump.scorecard({
      values: {
        email: 'bad',
      },
    })

    expect(card.check.email).toMatchObject({
      valid: false,
      error: 'Must be a valid email address',
    })
    expect(card.fields.email).toMatchObject({
      valid: false,
      error: 'Must be a valid email address',
    })
  })

  test('throws for validator config that references an unknown field', () => {
    expect(() =>
      umpire({
        fields: {
          alpha: {},
        },
        rules: [],
        validators: {
          beta: (value: unknown) => value === 'ok',
        } as never,
      }),
    ).toThrow('Unknown field "beta" referenced by validators')
  })

  test('throws for invalid validator config shapes', () => {
    expect(() =>
      umpire({
        fields: {
          alpha: {},
        },
        rules: [],
        validators: {
          alpha: {
            validator: { nope: true },
          },
        } as never,
      }),
    ).toThrow('Invalid validator configured for field "alpha"')
  })

  test('rejects validation entry objects with non-string error metadata', () => {
    expect(
      normalizeValidationEntry({
        validator: (value: string) => value.length > 0,
        error: 123,
      }),
    ).toBeNull()
  })

  test('treats invalid object results as invalid and falls back to wrapped error', () => {
    expect(
      runValidationEntry(
        {
          validate: () => ({ valid: false, error: 123 }) as never,
          error: 'Fallback',
        },
        'bad',
      ),
    ).toEqual({ valid: false, error: 'Fallback' })
  })
})
