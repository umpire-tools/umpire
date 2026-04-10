import { check, getNamedCheckMetadata } from '@umpire/core'

import { checks, createNamedCheckFromRule, defaultCheckReason, hydrateIsEmptyStrategy } from '../src/index.js'
import {
  assertValidCheckSpec,
  createCheckRuleFromMetadata,
  createCheckSpecFromMetadata,
} from '../src/check-ops.js'

describe('checks', () => {
  test.each([
    ['email', checks.email(), 'user@example.com', 'invalid', 'Must be a valid email address'],
    ['url', checks.url(), 'https://example.com', '/relative', 'Must be a valid URL'],
    ['minLength', checks.minLength(3), 'abcd', 'ab', 'Must be at least 3 characters'],
    ['maxLength', checks.maxLength(3), 'abc', 'abcd', 'Must be 3 characters or fewer'],
    ['min', checks.min(3), 4, 2, 'Must be at least 3'],
    ['max', checks.max(3), 2, 4, 'Must be 3 or less'],
    ['range', checks.range(2, 4), 3, 5, 'Must be between 2 and 4'],
    ['integer', checks.integer(), 3, 3.5, 'Must be a whole number'],
  ])(
    'validates %s',
    (_label, validator, passingValue, failingValue, expectedReason) => {
      expect(validator.validate(passingValue as never)).toBe(true)
      expect(validator.validate(failingValue as never)).toBe(false)
      expect(defaultCheckReason(validator)).toBe(expectedReason)
    },
  )

  test('matches validates a serializable regex pattern', () => {
    const validator = checks.matches('^[a-z0-9_]+$')

    expect(validator.validate('umpire_ok')).toBe(true)
    expect(validator.validate('Not OK')).toBe(false)
    expect(defaultCheckReason(validator)).toBe('Must match the required format')
  })

  test('email accepts common valid forms and rejects obvious invalid dot forms', () => {
    const validator = checks.email()

    expect(validator.validate("first.last+tag_o'reilly@example-domain.com")).toBe(true)
    expect(validator.validate('.leading-dot@example.com')).toBe(false)
    expect(validator.validate('double..dot@example.com')).toBe(false)
  })

  test('produces named check metadata compatible with core check()', () => {
    const validator = checks.maxLength(5)
    const predicate = check<Record<string, {}>, Record<string, unknown>>('email', validator)

    expect(getNamedCheckMetadata(predicate)).toEqual({
      __check: 'maxLength',
      params: { value: 5 },
    })
  })

  test('hydrates a named check from a JSON rule definition', () => {
    const validator = createNamedCheckFromRule({
      type: 'check',
      field: 'username',
      op: 'matches',
      pattern: '^[a-z]+$',
    })

    expect(validator.validate('abc')).toBe(true)
    expect(validator.validate('123')).toBe(false)
    expect(getNamedCheckMetadata(validator)).toEqual({
      __check: 'matches',
      params: { pattern: '^[a-z]+$' },
    })
  })

  test('serializes named-check metadata back into portable specs', () => {
    expect(createCheckSpecFromMetadata({
      __check: 'matches',
      params: { pattern: '^[a-z]+$' },
    })).toEqual({
      op: 'matches',
      pattern: '^[a-z]+$',
    })

    expect(createCheckSpecFromMetadata({
      __check: 'range',
      params: { min: 2, max: 4 },
    })).toEqual({
      op: 'range',
      min: 2,
      max: 4,
    })
  })

  test.each([
    {
      __check: 'matches',
      params: {},
    },
    {
      __check: 'minLength',
      params: { value: '3' },
    },
    {
      __check: 'range',
      params: { min: 2 },
    },
    {
      __check: 'custom',
    },
  ])('returns undefined for malformed metadata: %j', (metadata) => {
    expect(createCheckSpecFromMetadata(metadata as never)).toBeUndefined()
  })

  test('creates portable check rules and omits default reasons', () => {
    expect(createCheckRuleFromMetadata(
      'score',
      { __check: 'min', params: { value: 3 } },
      'Must be at least 3',
    )).toEqual({
      type: 'check',
      field: 'score',
      op: 'min',
      value: 3,
    })

    expect(createCheckRuleFromMetadata(
      'score',
      { __check: 'min', params: { value: 3 } },
      'Need at least three runs',
    )).toEqual({
      type: 'check',
      field: 'score',
      op: 'min',
      value: 3,
      reason: 'Need at least three runs',
    })

    expect(createCheckRuleFromMetadata(
      'score',
      { __check: 'range', params: { min: 1 } },
      'Broken metadata',
    )).toBeUndefined()
  })

  test('falls back for unknown reason labels and rejects invalid specs', () => {
    expect(defaultCheckReason({ __check: 'custom' } as never)).toBe('Invalid value')
    expect(() => hydrateIsEmptyStrategy('mystery' as never)).toThrow('Unknown isEmpty strategy')

    expect(() =>
      assertValidCheckSpec({ op: 'min', value: Number.NaN }),
    ).toThrow('Check rule "min" requires a numeric value')

    expect(() =>
      assertValidCheckSpec({ op: 'range', min: 1, max: Number.NaN }),
    ).toThrow('Check rule "range" requires numeric min and max values')

    expect(() =>
      assertValidCheckSpec({ op: 'custom' } as never),
    ).toThrow('Unknown named check op "custom"')
  })
})
