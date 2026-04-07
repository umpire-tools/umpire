import { jest } from '@jest/globals'
import {
  anyOf,
  check,
  createRules,
  defineRule,
  disables,
  enabledWhen,
  getNamedCheckMetadata,
  isNamedCheck,
  oneOf,
  requires,
} from '../src/rules.js'

type TestFields = {
  alpha: {}
  beta: {}
  gamma: {}
  delta: {}
}

type TestConditions = {
  allow: boolean
  activeBranch?: string
}

describe('enabledWhen', () => {
  test('returns correct type, targets, and sources', () => {
    const rule = enabledWhen<TestFields, TestConditions>(
      'alpha',
      (_values, conditions) => conditions.allow,
    )

    expect(rule.type).toBe('enabledWhen')
    expect(rule.targets).toEqual(['alpha'])
    expect(rule.sources).toEqual([])
  })

  test('evaluate returns the target map entry', () => {
    const rule = enabledWhen<TestFields, TestConditions>(
      'alpha',
      (_values, conditions) => conditions.allow,
    )

    expect(rule.evaluate({}, { allow: true }).get('alpha')).toEqual({
      enabled: true,
      reason: null,
    })
    expect(rule.evaluate({}, { allow: false }).get('alpha')).toEqual({
      enabled: false,
      reason: 'condition not met',
    })
  })

  test('supports string and function reasons', () => {
    const staticReasonRule = enabledWhen<TestFields, TestConditions>(
      'alpha',
      () => false,
      { reason: 'blocked' },
    )
    const dynamicReasonRule = enabledWhen<TestFields, TestConditions>(
      'alpha',
      () => false,
      { reason: (_values, conditions) => (conditions.allow ? 'allowed' : 'denied') },
    )

    expect(staticReasonRule.evaluate({}, { allow: false }).get('alpha')?.reason).toBe('blocked')
    expect(dynamicReasonRule.evaluate({}, { allow: false }).get('alpha')?.reason).toBe('denied')
  })
})

describe('disables', () => {
  test('with field name source uses source metadata and satisfaction semantics', () => {
    const rule = disables<TestFields, TestConditions>('beta', ['alpha', 'gamma'])

    expect(rule.type).toBe('disables')
    expect(rule.sources).toEqual(['beta'])
    expect(rule.targets).toEqual(['alpha', 'gamma'])

    expect(rule.evaluate({ beta: 'present' }, { allow: true }).get('alpha')).toEqual({
      enabled: false,
      reason: 'overridden by beta',
    })
    expect(rule.evaluate({ beta: undefined }, { allow: true }).get('alpha')).toEqual({
      enabled: true,
      reason: null,
    })
  })

  test('with predicate source keeps sources empty', () => {
    const rule = disables<TestFields, TestConditions>(
      (_values, conditions) => conditions.allow,
      ['alpha'],
    )

    expect(rule.sources).toEqual([])
    expect(rule.evaluate({}, { allow: true }).get('alpha')?.enabled).toBe(false)
  })

  test('with check() source extracts the source field', () => {
    const rule = disables<TestFields, TestConditions>(check('beta', (value) => value === 'ok'), [
      'alpha',
    ])

    expect(rule.sources).toEqual(['beta'])
    expect(rule.evaluate({ beta: 'ok' }, { allow: true }).get('alpha')?.reason).toBe(
      'overridden by beta',
    )
  })
})

describe('requires', () => {
  test('with field name dependency exposes correct targets and sources', () => {
    const rule = requires<TestFields, TestConditions>('alpha', 'beta')

    expect(rule.type).toBe('requires')
    expect(rule.targets).toEqual(['alpha'])
    expect(rule.sources).toEqual(['beta'])
    expect(rule.evaluate({ beta: undefined }, { allow: true }).get('alpha')).toMatchObject({
      enabled: false,
      reason: 'requires beta',
    })
    expect(rule.evaluate({ beta: 0 }, { allow: true }).get('alpha')).toEqual({
      enabled: true,
      reason: null,
    })
  })

  test('detects options when the last arg has a reason property', () => {
    const rule = requires<TestFields, TestConditions>('alpha', 'beta', { reason: 'custom reason' })

    expect(rule.evaluate({ beta: undefined }, { allow: true }).get('alpha')).toMatchObject({
      enabled: false,
      reason: 'custom reason',
    })
  })

  test('supports predicate dependencies', () => {
    const rule = requires<TestFields, TestConditions>(
      'alpha',
      (_values, conditions) => conditions.allow,
    )

    expect(rule.sources).toEqual([])
    expect(rule.evaluate({}, { allow: false }).get('alpha')).toMatchObject({
      enabled: false,
      reason: 'required condition not met',
    })
  })

  test('throws when no dependencies are provided', () => {
    expect(() =>
      requires<TestFields, TestConditions>('alpha', { reason: 'custom reason' }),
    ).toThrow('requires("alpha") requires at least one dependency')
  })
})

describe('oneOf', () => {
  test('throws when no branches are provided', () => {
    expect(() => oneOf<TestFields, TestConditions>('strategy', {})).toThrow(
      'oneOf("strategy") must include at least one branch',
    )
  })

  test('throws on overlapping fields', () => {
    expect(() =>
      oneOf<TestFields, TestConditions>('strategy', {
        first: ['alpha', 'beta'],
        second: ['beta', 'gamma'],
      }),
    ).toThrow('appears in multiple branches')
  })

  test('throws on empty branches', () => {
    expect(() =>
      oneOf<TestFields, TestConditions>('strategy', {
        first: [],
        second: ['beta'],
      }),
    ).toThrow('must not be empty')
  })

  test('returns all fields as targets', () => {
    const rule = oneOf<TestFields, TestConditions>('strategy', {
      first: ['alpha'],
      second: ['beta', 'gamma'],
    })

    expect(rule.targets).toEqual(['alpha', 'beta', 'gamma'])
    expect(rule.sources).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('auto-detects the active branch from satisfied fields', () => {
    const rule = oneOf<TestFields, TestConditions>('strategy', {
      first: ['alpha'],
      second: ['beta', 'gamma'],
    })

    const result = rule.evaluate({ beta: 'active' }, { allow: true })

    expect(result.get('alpha')).toEqual({
      enabled: false,
      reason: 'conflicts with second strategy',
    })
    expect(result.get('beta')).toEqual({
      enabled: true,
      reason: null,
    })
    expect(result.get('gamma')).toEqual({
      enabled: true,
      reason: null,
    })
  })

  test('uses prev to resolve ambiguity', () => {
    const rule = oneOf<TestFields, TestConditions>('strategy', {
      first: ['alpha'],
      second: ['beta'],
    })

    const result = rule.evaluate(
      { alpha: 'still here', beta: 'new value' },
      { allow: true },
      { alpha: 'still here' },
    )

    expect(result.get('alpha')).toEqual({
      enabled: false,
      reason: 'conflicts with second strategy',
    })
    expect(result.get('beta')).toEqual({
      enabled: true,
      reason: null,
    })
  })

  test('supports static activeBranch', () => {
    const rule = oneOf<TestFields, TestConditions>(
      'strategy',
      {
        first: ['alpha'],
        second: ['beta'],
      },
      { activeBranch: 'first' },
    )

    expect(rule.evaluate({}, { allow: true }).get('beta')).toEqual({
      enabled: false,
      reason: 'conflicts with first strategy',
    })
  })

  test('supports function activeBranch', () => {
    const rule = oneOf<TestFields, TestConditions>(
      'strategy',
      {
        first: ['alpha'],
        second: ['beta'],
      },
      { activeBranch: (values) => (values.delta === 'pick-second' ? 'second' : 'first') },
    )

    expect(rule.evaluate({ delta: 'pick-second' }, { allow: true }).get('alpha')).toEqual({
      enabled: false,
      reason: 'conflicts with second strategy',
    })
  })

  test('throws when static activeBranch names an unknown branch', () => {
    expect(() =>
      oneOf<TestFields, TestConditions>(
        'strategy',
        {
          first: ['alpha'],
          second: ['beta'],
        },
        { activeBranch: 'missing' },
      ),
    ).toThrow('Unknown active branch "missing" for oneOf("strategy")')
  })

  test('throws when dynamic activeBranch returns an unknown branch', () => {
    const rule = oneOf<TestFields, TestConditions>(
      'strategy',
      {
        first: ['alpha'],
        second: ['beta'],
      },
      { activeBranch: () => 'missing' as never },
    )

    expect(() => rule.evaluate({}, { allow: true })).toThrow(
      'Unknown active branch "missing" for oneOf("strategy")',
    )
  })

  test('warns and falls back when prev introduces multiple newly satisfied branches', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const rule = oneOf<TestFields, TestConditions>('strategy', {
        first: ['alpha'],
        second: ['beta'],
        third: ['gamma'],
      })

      const result = rule.evaluate(
        { alpha: 'new alpha', beta: 'new beta', gamma: 'existing gamma' },
        { allow: true },
        { gamma: 'existing gamma' },
      )

      expect(result.get('alpha')).toEqual({ enabled: true, reason: null })
      expect(result.get('beta')).toEqual({
        enabled: false,
        reason: 'conflicts with first strategy',
      })
      expect(result.get('gamma')).toEqual({
        enabled: false,
        reason: 'conflicts with first strategy',
      })
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  test('does not warn in production when ambiguity falls back to the first branch', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const previousEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      const rule = oneOf<TestFields, TestConditions>('strategy', {
        first: ['alpha'],
        second: ['beta'],
      })

      expect(rule.evaluate({ alpha: 'set', beta: 'set' }, { allow: true }).get('beta')).toEqual({
        enabled: false,
        reason: 'conflicts with first strategy',
      })
      expect(warn).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = previousEnv
      warn.mockRestore()
    }
  })
})

describe('anyOf', () => {
  test('throws when no rules are provided', () => {
    expect(() => anyOf<TestFields, TestConditions>()).toThrow(
      'anyOf() requires at least one rule',
    )
  })

  test('validates that all inner rules target the same fields', () => {
    expect(() =>
      anyOf<TestFields, TestConditions>(
        enabledWhen('alpha', () => true),
        enabledWhen('beta', () => true),
      ),
    ).toThrow('must target the same fields')
  })

  test('passes if any inner rule passes', () => {
    const rule = anyOf<TestFields, TestConditions>(
      enabledWhen('alpha', () => false, { reason: 'first failed' }),
      enabledWhen('alpha', () => true, { reason: 'second failed' }),
    )

    expect(rule.evaluate({}, { allow: false }).get('alpha')).toEqual({
      enabled: true,
      reason: null,
    })
  })

  test('collects all failure reasons when every inner rule fails', () => {
    const rule = anyOf<TestFields, TestConditions>(
      enabledWhen('alpha', () => false, { reason: 'first failed' }),
      enabledWhen('alpha', () => false, { reason: 'second failed' }),
    )

    const result = rule.evaluate({}, { allow: false }).get('alpha') as {
      enabled: boolean
      reason: string | null
      reasons?: string[]
    }

    expect(result).toMatchObject({
      enabled: false,
      reason: 'first failed',
      reasons: ['first failed', 'second failed'],
    })
  })

  test('uses supplied dependency availability when evaluating inner requires directly', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rule = anyOf<TestFields, TestConditions>(
      requires('gamma', 'beta', { reason: 'need beta' }),
      enabledWhen('gamma', () => false, { reason: 'fallback false' }),
    )

    expect(
      rule.evaluate(
        { beta: 'stale' },
        { allow: true },
        undefined,
        fields,
        {
          alpha: { enabled: true, required: false, reason: null, reasons: [] },
          beta: { enabled: false, required: false, reason: 'disabled', reasons: ['disabled'] },
          gamma: { enabled: true, required: false, reason: null, reasons: [] },
          delta: { enabled: true, required: false, reason: null, reasons: [] },
        },
      ).get('gamma'),
    ).toEqual({
      enabled: false,
      reason: 'need beta',
      reasons: ['need beta', 'fallback false'],
    })
  })
})

describe('defineRule', () => {
  test('creates an enabled custom rule by default', () => {
    const rule = defineRule<TestFields, TestConditions>({
      type: 'customEnabled',
      targets: ['alpha', 'alpha'],
      sources: ['beta', 'beta'],
      evaluate: () => new Map([
        ['alpha', {
          enabled: false,
          reason: 'custom blocked',
        }],
      ]),
    })

    expect(rule.type).toBe('customEnabled')
    expect(rule.targets).toEqual(['alpha'])
    expect(rule.sources).toEqual(['beta'])
    expect(rule.evaluate({}, { allow: true }).get('alpha')).toEqual({
      enabled: false,
      reason: 'custom blocked',
    })
  })

  test('lets anyOf combine fair custom rules when constraint is fair', () => {
    const socketRule = defineRule<TestFields, TestConditions>({
      type: 'socketFair',
      targets: ['alpha'],
      sources: ['beta'],
      constraint: 'fair',
      evaluate(values) {
        const matches = values.alpha === values.beta

        return new Map([
          ['alpha', {
            enabled: true,
            fair: matches,
            reason: matches ? null : 'socket mismatch',
          }],
        ])
      },
    })
    const allowDeltaRule = defineRule<TestFields, TestConditions>({
      type: 'deltaFair',
      targets: ['alpha'],
      sources: ['delta'],
      constraint: 'fair',
      evaluate(values) {
        const allowed = values.delta === 'override'

        return new Map([
          ['alpha', {
            enabled: true,
            fair: allowed,
            reason: allowed ? null : 'delta override missing',
          }],
        ])
      },
    })
    const rule = anyOf(socketRule, allowDeltaRule)

    expect(rule.evaluate({ alpha: 'am5', beta: 'am5' }, { allow: false }).get('alpha')).toEqual({
      enabled: true,
      fair: true,
      reason: null,
    })
    expect(
      rule.evaluate({ alpha: 'am5', beta: 'lga1700', delta: 'missing' }, { allow: false }).get('alpha'),
    ).toEqual({
      enabled: true,
      fair: false,
      reason: 'socket mismatch',
      reasons: ['socket mismatch', 'delta override missing'],
    })
  })
})

describe('check', () => {
  test('detects named check validators', () => {
    expect(
      isNamedCheck({
        __check: 'email',
        validate: (value: unknown) => value === 'ok',
      }),
    ).toBe(true)
    expect(isNamedCheck({ validate: () => true })).toBe(false)
  })

  test.each([
    ['null', null],
    ['string primitive', 'email'],
    ['function validator', () => true],
    ['non-string __check', { __check: 123, validate: () => true }],
    ['missing validate', { __check: 'email' }],
    ['non-function validate', { __check: 'email', validate: true }],
  ])('rejects invalid named check shape: %s', (_label, validator) => {
    expect(isNamedCheck(validator)).toBe(false)
  })

  test('supports function validators', () => {
    const predicate = check<TestFields, TestConditions>('alpha', (value) => value === 'ok')

    expect(predicate({ alpha: 'ok' }, { allow: true })).toBe(true)
    expect(predicate({ alpha: 'nope' }, { allow: true })).toBe(false)
  })

  test('supports named check validators and preserves copied metadata', () => {
    const validator = {
      __check: 'minLength',
      params: { value: 3 },
      validate: (value: string) => value.length >= 3,
    }
    const predicate = check<TestFields, TestConditions>('alpha', validator)

    validator.__check = 'maxLength'
    validator.params.value = 10

    expect(predicate({ alpha: 'abc' }, { allow: true })).toBe(true)
    expect(predicate({ alpha: 'ab' }, { allow: true })).toBe(false)
    expect(getNamedCheckMetadata(predicate)).toEqual({
      __check: 'minLength',
      params: { value: 3 },
    })
  })

  test('supports zod-like safeParse validators', () => {
    const predicate = check<TestFields, TestConditions>('alpha', {
      safeParse: (value: unknown) => ({ success: value === 'ok' }),
    })

    expect(predicate({ alpha: 'ok' }, { allow: true })).toBe(true)
    expect(predicate({ alpha: 'nope' }, { allow: true })).toBe(false)
  })

  test('supports regex-like test validators', () => {
    const predicate = check<TestFields, TestConditions>('alpha', {
      test: (value: unknown) => typeof value === 'string' && /^a/.test(value),
    })

    expect(predicate({ alpha: 'abc' }, { allow: true })).toBe(true)
    expect(predicate({ alpha: 'zzz' }, { allow: true })).toBe(false)
  })

  test('attaches _checkField metadata', () => {
    const predicate = check<TestFields, TestConditions>('alpha', () => true)

    expect(predicate._checkField).toBe('alpha')
  })

  test('returns false for unsupported validators', () => {
    const predicate = check<TestFields, TestConditions>('alpha', {} as never)

    expect(predicate({ alpha: 'ok' }, { allow: true })).toBe(false)
  })
})

describe('createRules', () => {
  test('returns the typed rule factory helpers', () => {
    const factories = createRules<TestFields, TestConditions>()

    expect(Object.keys(factories).sort()).toEqual([
      'anyOf',
      'check',
      'defineRule',
      'disables',
      'enabledWhen',
      'fairWhen',
      'oneOf',
      'requires',
    ])
    expect(factories.enabledWhen('alpha', () => true).type).toBe('enabledWhen')
  })
})
