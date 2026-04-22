import { describe, expect, spyOn, test } from 'bun:test'
import { field } from '../src/field.js'
import { isNamedCheck } from '../src/validation.js'
import {
  anyOf,
  check,
  createRules,
  defineRule,
  disables,
  eitherOf,
  enabledWhen,
  fairWhen,
  getGraphSourceInfo,
  getNamedCheckMetadata,
  inspectPredicate,
  inspectRule,
  oneOf,
  requires,
} from '../src/rules.js'
import type { Rule } from '../src/types.js'

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
      {
        reason: (_values, conditions) =>
          conditions.allow ? 'allowed' : 'denied',
      },
    )

    expect(
      staticReasonRule.evaluate({}, { allow: false }).get('alpha')?.reason,
    ).toBe('blocked')
    expect(
      dynamicReasonRule.evaluate({}, { allow: false }).get('alpha')?.reason,
    ).toBe('denied')
  })
})

describe('disables', () => {
  test('with field name source uses source metadata and satisfaction semantics', () => {
    const rule = disables<TestFields, TestConditions>('beta', [
      'alpha',
      'gamma',
    ])

    expect(rule.type).toBe('disables')
    expect(rule.sources).toEqual(['beta'])
    expect(rule.targets).toEqual(['alpha', 'gamma'])

    expect(
      rule.evaluate({ beta: 'present' }, { allow: true }).get('alpha'),
    ).toEqual({
      enabled: false,
      reason: 'overridden by beta',
    })
    expect(
      rule.evaluate({ beta: undefined }, { allow: true }).get('alpha'),
    ).toEqual({
      enabled: true,
      reason: null,
    })
  })

  test('accepts named builders for source and targets', () => {
    const alpha = field<string>('alpha')
    const beta = field<string>('beta')
    const gamma = field<string>('gamma')
    const rule = disables(beta, [alpha, gamma])

    expect(rule.sources).toEqual(['beta'])
    expect(rule.targets).toEqual(['alpha', 'gamma'])
    expect(
      rule.evaluate({ beta: 'present' }, { allow: true }).get('alpha'),
    ).toEqual({
      enabled: false,
      reason: 'overridden by beta',
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
    const rule = disables<TestFields, TestConditions>(
      check('beta', (value) => value === 'ok'),
      ['alpha'],
    )

    expect(rule.sources).toEqual(['beta'])
    expect(
      rule.evaluate({ beta: 'ok' }, { allow: true }).get('alpha')?.reason,
    ).toBe('overridden by beta')
  })

  test('requires named builders when passing builders to source or targets', () => {
    expect(() => disables(field<string>(), ['alpha'])).toThrow(
      'Named field builder required when passing a field() value to a rule',
    )

    expect(() => disables('beta', [field<string>()])).toThrow(
      'Named field builder required when passing a field() value to a rule',
    )
  })
})

describe('requires', () => {
  test('with field name dependency exposes correct targets and sources', () => {
    const rule = requires<TestFields, TestConditions>('alpha', 'beta')

    expect(rule.type).toBe('requires')
    expect(rule.targets).toEqual(['alpha'])
    expect(rule.sources).toEqual(['beta'])
    expect(
      rule.evaluate({ beta: undefined }, { allow: true }).get('alpha'),
    ).toMatchObject({
      enabled: false,
      reason: 'requires beta',
    })
    expect(rule.evaluate({ beta: 0 }, { allow: true }).get('alpha')).toEqual({
      enabled: true,
      reason: null,
    })
  })

  test('accepts named builders for target and dependencies', () => {
    const alpha = field<string>('alpha')
    const beta = field<string>('beta')
    const rule = requires(alpha, beta)

    expect(rule.targets).toEqual(['alpha'])
    expect(rule.sources).toEqual(['beta'])
    expect(
      rule.evaluate({ beta: undefined }, { allow: true }).get('alpha'),
    ).toMatchObject({
      enabled: false,
      reason: 'requires beta',
    })
  })

  test('detects options when the last arg has a reason property', () => {
    const rule = requires<TestFields, TestConditions>('alpha', 'beta', {
      reason: 'custom reason',
    })

    expect(
      rule.evaluate({ beta: undefined }, { allow: true }).get('alpha'),
    ).toMatchObject({
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
      requires<TestFields, TestConditions>('alpha', {
        reason: 'custom reason',
      }),
    ).toThrow('requires("alpha") requires at least one dependency')
  })

  test('requires named builders when passing builders as dependencies', () => {
    expect(() => requires('alpha', field<string>())).toThrow(
      'Named field builder required when passing a field() value to a rule',
    )
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

  test('requires named builders when passing builders in branch definitions', () => {
    expect(() =>
      oneOf('strategy', {
        first: [field<string>()],
        second: ['beta'],
      }),
    ).toThrow(
      'Named field builder required when passing a field() value to a rule',
    )
  })

  test('returns all fields as targets', () => {
    const rule = oneOf<TestFields, TestConditions>('strategy', {
      first: ['alpha'],
      second: ['beta', 'gamma'],
    })

    expect(rule.targets).toEqual(['alpha', 'beta', 'gamma'])
    expect(rule.sources).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('accepts named builders in branch definitions', () => {
    const alpha = field<string>('alpha')
    const beta = field<string>('beta')
    const gamma = field<string>('gamma')
    const rule = oneOf('strategy', {
      first: [alpha],
      second: [beta, gamma],
    })

    expect(rule.targets).toEqual(['alpha', 'beta', 'gamma'])
    expect(rule.sources).toEqual(['alpha', 'beta', 'gamma'])
    expect(
      rule.evaluate({ beta: 'active' }, { allow: true }).get('alpha'),
    ).toEqual({
      enabled: false,
      reason: 'conflicts with second strategy',
    })
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
      {
        activeBranch: (values) =>
          values.delta === 'pick-second' ? 'second' : 'first',
      },
    )

    expect(
      rule.evaluate({ delta: 'pick-second' }, { allow: true }).get('alpha'),
    ).toEqual({
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
    const warn = spyOn(console, 'warn').mockImplementation(() => {})

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
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const previousEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      const rule = oneOf<TestFields, TestConditions>('strategy', {
        first: ['alpha'],
        second: ['beta'],
      })

      expect(
        rule
          .evaluate({ alpha: 'set', beta: 'set' }, { allow: true })
          .get('beta'),
      ).toEqual({
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

  test('accepts matching anyOf targets regardless of declaration order', () => {
    const left = defineRule<TestFields, TestConditions>({
      type: 'left',
      targets: ['beta', 'alpha'],
      sources: [],
      evaluate: () =>
        new Map([
          ['alpha', { enabled: true, reason: null }],
          ['beta', { enabled: true, reason: null }],
        ]),
    })
    const right = defineRule<TestFields, TestConditions>({
      type: 'right',
      targets: ['alpha', 'beta'],
      sources: [],
      evaluate: () =>
        new Map([
          ['alpha', { enabled: true, reason: null }],
          ['beta', { enabled: true, reason: null }],
        ]),
    })

    expect(() => anyOf(left, right)).not.toThrow()
  })

  test('rejects anyOf rules when one target differs in a matching-length list', () => {
    const left = defineRule<TestFields, TestConditions>({
      type: 'left',
      targets: ['alpha', 'beta'],
      sources: [],
      evaluate: () =>
        new Map([
          ['alpha', { enabled: true, reason: null }],
          ['beta', { enabled: true, reason: null }],
        ]),
    })
    const right = defineRule<TestFields, TestConditions>({
      type: 'right',
      targets: ['alpha', 'gamma'],
      sources: [],
      evaluate: () =>
        new Map([
          ['alpha', { enabled: true, reason: null }],
          ['gamma', { enabled: true, reason: null }],
        ]),
    })

    expect(() => anyOf(left, right)).toThrow('must target the same fields')
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
      rule
        .evaluate({ beta: 'stale' }, { allow: true }, undefined, fields, {
          alpha: { enabled: true, required: false, reason: null, reasons: [] },
          beta: {
            enabled: false,
            required: false,
            reason: 'disabled',
            reasons: ['disabled'],
          },
          gamma: { enabled: true, required: false, reason: null, reasons: [] },
          delta: { enabled: true, required: false, reason: null, reasons: [] },
        })
        .get('gamma'),
    ).toEqual({
      enabled: false,
      reason: 'need beta',
      reasons: ['need beta', 'fallback false'],
    })
  })
})

describe('eitherOf', () => {
  test('throws when no branches are provided', () => {
    expect(() => eitherOf<TestFields, TestConditions>('auth', {})).toThrow(
      'eitherOf("auth") must include at least one branch',
    )
  })

  test('throws on empty branches', () => {
    expect(() =>
      eitherOf<TestFields, TestConditions>('auth', {
        sso: [],
        password: [enabledWhen('alpha', () => true)],
      }),
    ).toThrow('eitherOf("auth") branch "sso" must not be empty')
  })

  test('validates that all inner rules target the same fields', () => {
    expect(() =>
      eitherOf<TestFields, TestConditions>('auth', {
        sso: [enabledWhen('alpha', () => true)],
        password: [enabledWhen('beta', () => true)],
      }),
    ).toThrow('eitherOf("auth") rules must target the same fields')
  })

  test('validates that all inner rules share the same constraint', () => {
    expect(() =>
      eitherOf<TestFields, TestConditions>('auth', {
        sso: [enabledWhen('alpha', () => true)],
        password: [fairWhen('alpha', () => true)],
      }),
    ).toThrow(
      'eitherOf("auth") cannot mix fairWhen rules with availability rules',
    )
  })

  test('also rejects mixed constraints when the first eitherOf rule is fair', () => {
    expect(() =>
      eitherOf<TestFields, TestConditions>('auth', {
        fairness: [fairWhen('alpha', () => true)],
        enabled: [enabledWhen('alpha', () => true)],
      }),
    ).toThrow(
      'eitherOf("auth") cannot mix fairWhen rules with availability rules',
    )
  })

  test('passes if one branch passes', () => {
    const rule = eitherOf<TestFields, TestConditions>('auth', {
      sso: [enabledWhen('alpha', () => false, { reason: 'sso unavailable' })],
      password: [enabledWhen('alpha', () => true, { reason: 'need password' })],
    })

    expect(rule.evaluate({}, { allow: false }).get('alpha')).toEqual({
      enabled: true,
      reason: null,
    })
  })

  test('passes if multiple branches pass', () => {
    const rule = eitherOf<TestFields, TestConditions>('auth', {
      sso: [enabledWhen('alpha', () => true, { reason: 'sso unavailable' })],
      password: [enabledWhen('alpha', () => true, { reason: 'need password' })],
      magicLink: [
        enabledWhen('alpha', () => false, { reason: 'magic link unavailable' }),
      ],
    })

    expect(rule.evaluate({}, { allow: false }).get('alpha')).toEqual({
      enabled: true,
      reason: null,
    })
  })

  test('collects flattened failure reasons in branch order when every branch fails', () => {
    const rule = eitherOf<TestFields, TestConditions>('auth', {
      sso: [enabledWhen('alpha', () => false, { reason: 'sso unavailable' })],
      password: [
        enabledWhen('alpha', () => false, { reason: 'enter a password' }),
        enabledWhen('alpha', () => false, { reason: 'password too short' }),
      ],
    })

    expect(rule.evaluate({}, { allow: false }).get('alpha')).toEqual({
      enabled: false,
      reason: 'sso unavailable',
      reasons: ['sso unavailable', 'enter a password', 'password too short'],
    })
  })

  test('supports fair OR logic across named branches', () => {
    const rule = eitherOf<TestFields, TestConditions>('compatibility', {
      socket: [
        fairWhen('alpha', (value, values) => value === values.beta, {
          reason: 'socket mismatch',
        }),
      ],
      override: [
        fairWhen('alpha', (_value, values) => values.delta === 'override', {
          reason: 'override missing',
        }),
      ],
    })

    expect(
      rule
        .evaluate({ alpha: 'am5', beta: 'am5' }, { allow: false })
        .get('alpha'),
    ).toEqual({
      enabled: true,
      fair: true,
      reason: null,
    })
    expect(
      rule
        .evaluate(
          { alpha: 'am5', beta: 'lga1700', delta: 'missing' },
          { allow: false },
        )
        .get('alpha'),
    ).toEqual({
      enabled: true,
      fair: false,
      reason: 'socket mismatch',
      reasons: ['socket mismatch', 'override missing'],
    })
  })
})

describe('defineRule', () => {
  test('creates an enabled custom rule by default', () => {
    const rule = defineRule<TestFields, TestConditions>({
      type: 'customEnabled',
      targets: ['alpha', 'alpha'],
      sources: ['beta', 'beta'],
      evaluate: () =>
        new Map([
          [
            'alpha',
            {
              enabled: false,
              reason: 'custom blocked',
            },
          ],
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
          [
            'alpha',
            {
              enabled: true,
              fair: matches,
              reason: matches ? null : 'socket mismatch',
            },
          ],
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
          [
            'alpha',
            {
              enabled: true,
              fair: allowed,
              reason: allowed ? null : 'delta override missing',
            },
          ],
        ])
      },
    })
    const rule = anyOf(socketRule, allowDeltaRule)

    expect(
      rule
        .evaluate({ alpha: 'am5', beta: 'am5' }, { allow: false })
        .get('alpha'),
    ).toEqual({
      enabled: true,
      fair: true,
      reason: null,
    })
    expect(
      rule
        .evaluate(
          { alpha: 'am5', beta: 'lga1700', delta: 'missing' },
          { allow: false },
        )
        .get('alpha'),
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
    const predicate = check<TestFields, TestConditions>(
      'alpha',
      (value) => value === 'ok',
    )

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

  test('returns copied metadata from a predicate with attached named check metadata', () => {
    const predicate = check<TestFields, TestConditions>(
      'alpha',
      (value) => value === 'ok',
    )
    const metadata = { __check: 'custom', params: { value: 2 } }

    predicate._namedCheck = metadata

    const copied = getNamedCheckMetadata(predicate)

    expect(copied).toEqual(metadata)
    expect(copied).not.toBe(metadata)
  })

  test('returns undefined for values without named check metadata', () => {
    expect(getNamedCheckMetadata((_values: unknown) => true)).toBeUndefined()
    expect(getNamedCheckMetadata({})).toBeUndefined()
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

  test('inspectPredicate returns copied field and named check metadata', () => {
    const namedPredicate = check<TestFields, TestConditions>('alpha', {
      __check: 'minLength',
      params: { value: 3 },
      validate: (value: string) => value.length >= 3,
    })
    const plainPredicate = check<TestFields, TestConditions>(
      'beta',
      (value) => value === 'ok',
    )

    expect(inspectPredicate(namedPredicate)).toEqual({
      field: 'alpha',
      namedCheck: {
        __check: 'minLength',
        params: { value: 3 },
      },
    })
    expect(inspectPredicate(plainPredicate)).toEqual({
      field: 'beta',
    })
    expect(inspectPredicate((_values: unknown) => true)).toBeUndefined()
  })

  test('inspectPredicate includes both field and named check metadata when present', () => {
    const predicate = check<TestFields, TestConditions>('alpha', {
      __check: 'required',
      validate: (value: string) => value.length > 0,
    })

    expect(inspectPredicate(predicate)).toEqual({
      field: 'alpha',
      namedCheck: { __check: 'required' },
    })
  })

  test('inspectPredicate handles nullish and metadata-only inputs', () => {
    const predicate = check<TestFields, TestConditions>('alpha', () => true)
    delete predicate._checkField
    predicate._namedCheck = { __check: 'required' }

    expect(inspectPredicate(null)).toBeUndefined()
    expect(inspectPredicate(undefined)).toBeUndefined()
    expect(inspectPredicate(predicate)).toEqual({
      namedCheck: { __check: 'required' },
    })
  })

  test('inspectPredicate does not fabricate field/namedCheck when one side is missing', () => {
    const fieldOnly = check<TestFields, TestConditions>('alpha', () => true)
    const metadataOnly = check<TestFields, TestConditions>('beta', () => true)
    delete metadataOnly._checkField
    metadataOnly._namedCheck = { __check: 'required' }

    const inspectedFieldOnly = inspectPredicate(fieldOnly)
    const inspectedMetadataOnly = inspectPredicate(metadataOnly)

    expect(inspectedFieldOnly).toEqual({ field: 'alpha' })
    expect(Object.hasOwn(inspectedFieldOnly as object, 'namedCheck')).toBe(
      false,
    )
    expect(inspectedMetadataOnly).toEqual({
      namedCheck: { __check: 'required' },
    })
    expect(Object.hasOwn(inspectedMetadataOnly as object, 'field')).toBe(false)
  })

  test('returns copied named check metadata without params', () => {
    const predicate = check<TestFields, TestConditions>('alpha', {
      __check: 'required',
      validate: () => true,
    })

    const metadata = getNamedCheckMetadata(predicate)

    expect(metadata).toEqual({
      __check: 'required',
    })
    expect(metadata).toBeDefined()
    expect(Object.hasOwn(metadata as object, 'params')).toBe(false)
  })

  test('returns false for unsupported validators', () => {
    const predicate = check<TestFields, TestConditions>('alpha', {} as never)

    expect(predicate({ alpha: 'ok' }, { allow: true })).toBe(false)
  })
})

describe('inspectRule', () => {
  test('describes built-in rule factories without exposing private metadata', () => {
    const namedPredicate = check<TestFields, TestConditions>('beta', {
      __check: 'email',
      validate: (value: string) => value.includes('@'),
    })
    const enabledRule = enabledWhen<TestFields, TestConditions>(
      'alpha',
      namedPredicate,
      {
        reason: 'need a valid email',
      },
    )
    const fairRule = requires<TestFields, TestConditions>(
      'gamma',
      'beta',
      check('delta', (value) => value === 'ok'),
      {
        reason: (_values, conditions) =>
          conditions.allow ? 'allowed' : 'blocked',
      },
    )
    const choiceRule = oneOf<TestFields, TestConditions>(
      'mode',
      {
        first: ['alpha'],
        second: ['beta'],
      },
      {
        activeBranch: (values) =>
          values.delta === 'pick-second' ? 'second' : 'first',
      },
    )

    expect(inspectRule(enabledRule)).toEqual({
      kind: 'enabledWhen',
      target: 'alpha',
      predicate: {
        field: 'beta',
        namedCheck: { __check: 'email' },
      },
      reason: 'need a valid email',
      hasDynamicReason: false,
    })
    expect(inspectRule(fairRule)).toEqual({
      kind: 'requires',
      target: 'gamma',
      dependencies: [
        { kind: 'field', field: 'beta' },
        {
          kind: 'predicate',
          predicate: { field: 'delta' },
        },
      ],
      hasDynamicReason: true,
    })
    expect(inspectRule(choiceRule)).toEqual({
      kind: 'oneOf',
      groupName: 'mode',
      branches: {
        first: ['alpha'],
        second: ['beta'],
      },
      hasDynamicActiveBranch: true,
      hasDynamicReason: false,
    })
  })

  test('describes anyOf and custom rules', () => {
    const customRule = defineRule<TestFields, TestConditions>({
      type: 'customEnabled',
      targets: ['alpha'],
      sources: ['beta'],
      evaluate: () => new Map([['alpha', { enabled: true, reason: null }]]),
    })
    const rule = anyOf<TestFields, TestConditions>(
      enabledWhen('alpha', () => false, { reason: 'nope' }),
      enabledWhen('alpha', () => true),
    )

    expect(inspectRule(customRule)).toEqual({
      kind: 'custom',
      type: 'customEnabled',
      constraint: 'enabled',
      targets: ['alpha'],
      sources: ['beta'],
    })
    expect(inspectRule(rule)).toEqual({
      kind: 'anyOf',
      constraint: 'enabled',
      rules: [
        {
          kind: 'enabledWhen',
          target: 'alpha',
          reason: 'nope',
          hasDynamicReason: false,
        },
        {
          kind: 'enabledWhen',
          target: 'alpha',
          hasDynamicReason: false,
        },
      ],
    })
  })

  test('describes eitherOf branches', () => {
    const rule = eitherOf<TestFields, TestConditions>('auth', {
      sso: [enabledWhen('alpha', () => false, { reason: 'sso unavailable' })],
      password: [enabledWhen('alpha', () => true)],
    })

    expect(inspectRule(rule)).toEqual({
      kind: 'eitherOf',
      groupName: 'auth',
      constraint: 'enabled',
      branches: {
        sso: [
          {
            kind: 'enabledWhen',
            target: 'alpha',
            reason: 'sso unavailable',
            hasDynamicReason: false,
          },
        ],
        password: [
          {
            kind: 'enabledWhen',
            target: 'alpha',
            hasDynamicReason: false,
          },
        ],
      },
    })
  })

  test('describes fair rules with custom fair constraint and graph sources', () => {
    const fairRule = fairWhen<TestFields, TestConditions>(
      'alpha',
      check('beta', (value) => value === 'ok'),
    )
    const customFair = defineRule<TestFields, TestConditions>({
      type: 'customFair',
      constraint: 'fair',
      targets: ['alpha'],
      sources: ['beta'],
      evaluate: () =>
        new Map([['alpha', { enabled: true, fair: true, reason: null }]]),
    })

    expect(inspectRule(fairRule)).toEqual({
      kind: 'fairWhen',
      target: 'alpha',
      predicate: { field: 'beta' },
      hasDynamicReason: false,
    })
    expect(getGraphSourceInfo(fairRule)).toEqual({
      ordering: [],
      informational: ['beta'],
    })
    expect(getGraphSourceInfo(customFair)).toEqual({
      ordering: [],
      informational: ['beta'],
    })
  })

  test('describes dynamic reasons and explicit active branches', () => {
    const enabledRule = enabledWhen<TestFields, TestConditions>(
      'alpha',
      () => false,
      {
        reason: (_values, conditions) =>
          conditions.allow ? 'allowed' : 'denied',
      },
    )
    const choiceRule = oneOf<TestFields, TestConditions>(
      'mode',
      {
        first: ['alpha'],
        second: ['beta'],
      },
      { activeBranch: 'second' },
    )

    expect(inspectRule(enabledRule)).toEqual({
      kind: 'enabledWhen',
      target: 'alpha',
      reason: undefined,
      hasDynamicReason: true,
    })
    expect(inspectRule(choiceRule)).toEqual({
      kind: 'oneOf',
      groupName: 'mode',
      branches: {
        first: ['alpha'],
        second: ['beta'],
      },
      activeBranch: 'second',
      hasDynamicActiveBranch: false,
      hasDynamicReason: false,
    })
  })

  test('inspectRule omits namedCheck metadata for plain check() predicates', () => {
    const rule = enabledWhen<TestFields, TestConditions>(
      'alpha',
      check('beta', (value) => value === 'ok'),
    )

    const inspected = inspectRule(rule)

    expect(inspected).toEqual({
      kind: 'enabledWhen',
      target: 'alpha',
      predicate: { field: 'beta' },
      hasDynamicReason: false,
    })
    expect(
      Object.hasOwn(
        (inspected as { predicate?: unknown }).predicate as object,
        'namedCheck',
      ),
    ).toBe(false)
  })

  test('collapses anyOf graph sources into ordering branches', () => {
    const orderingRule = defineRule<TestFields, TestConditions>({
      type: 'orderingRule',
      targets: ['alpha'],
      sources: ['beta'],
      evaluate: () => new Map([['alpha', { enabled: true, reason: null }]]),
    })
    const anotherOrderingRule = defineRule<TestFields, TestConditions>({
      type: 'anotherOrderingRule',
      targets: ['alpha'],
      sources: ['delta'],
      evaluate: () => new Map([['alpha', { enabled: true, reason: null }]]),
    })
    const anyRule = anyOf<TestFields, TestConditions>(
      orderingRule,
      anotherOrderingRule,
    )

    expect(getGraphSourceInfo(anyRule)).toEqual({
      ordering: ['beta', 'delta'],
      informational: [],
    })
  })

  test('deduplicates anyOf targets and sources in inspection and graphing', () => {
    const left = defineRule<TestFields, TestConditions>({
      type: 'left',
      targets: ['alpha', 'alpha'],
      sources: ['beta', 'beta'],
      evaluate: () => new Map([['alpha', { enabled: true, reason: null }]]),
    })
    const right = defineRule<TestFields, TestConditions>({
      type: 'right',
      targets: ['alpha'],
      sources: ['gamma'],
      evaluate: () => new Map([['alpha', { enabled: true, reason: null }]]),
    })
    const rule = anyOf(left, right)

    expect(inspectRule(rule)).toEqual({
      kind: 'anyOf',
      constraint: 'enabled',
      rules: [
        {
          kind: 'custom',
          type: 'left',
          constraint: 'enabled',
          targets: ['alpha'],
          sources: ['beta'],
        },
        {
          kind: 'custom',
          type: 'right',
          constraint: 'enabled',
          targets: ['alpha'],
          sources: ['gamma'],
        },
      ],
    })
    expect(rule.targets).toEqual(['alpha'])
    expect(rule.sources).toEqual(['beta', 'gamma'])
    expect(getGraphSourceInfo(rule)).toEqual({
      ordering: ['beta', 'gamma'],
      informational: [],
    })
  })

  test('returns undefined when anyOf contains an uninspectable inner rule', () => {
    const opaqueRule: Rule<TestFields, TestConditions> = {
      type: 'opaque',
      targets: ['alpha'],
      sources: ['beta'],
      evaluate: () => new Map([['alpha', { enabled: true, reason: null }]]),
    }

    expect(
      inspectRule(anyOf<TestFields, TestConditions>(opaqueRule)),
    ).toBeUndefined()
  })

  test('returns undefined when anyOf mixes inspectable and uninspectable inner rules', () => {
    const opaqueRule: Rule<TestFields, TestConditions> = {
      type: 'opaque',
      targets: ['alpha'],
      sources: ['beta'],
      evaluate: () => new Map([['alpha', { enabled: true, reason: null }]]),
    }

    expect(
      inspectRule(
        anyOf<TestFields, TestConditions>(
          enabledWhen('alpha', () => true),
          opaqueRule,
        ),
      ),
    ).toBeUndefined()
  })

  test('collapses eitherOf graph sources into informational branches', () => {
    const fairRule = fairWhen<TestFields, TestConditions>(
      'alpha',
      check('beta', (value) => value === 'ok'),
    )
    const anotherFairRule = fairWhen<TestFields, TestConditions>(
      'alpha',
      check('delta', (value) => value === 'ok'),
    )
    const eitherRule = eitherOf<TestFields, TestConditions>('group', {
      first: [fairRule],
      second: [anotherFairRule],
    })

    expect(getGraphSourceInfo(eitherRule)).toEqual({
      ordering: [],
      informational: ['beta', 'delta'],
    })
  })

  test('filters informational eitherOf sources that are already ordering sources', () => {
    const orderingRule = defineRule<TestFields, TestConditions>({
      type: 'orderingRule',
      targets: ['alpha'],
      sources: ['beta'],
      evaluate: () => new Map([['alpha', { enabled: true, reason: null }]]),
    })
    const informationalRule = defineRule<TestFields, TestConditions>({
      type: 'informationalRule',
      targets: ['alpha'],
      sources: ['beta', 'gamma'],
      evaluate: () =>
        new Map([['alpha', { enabled: true, fair: true, reason: null }]]),
    })
    const rule = {
      type: 'eitherOf',
      targets: ['alpha'],
      sources: ['beta', 'gamma'],
      evaluate: () => new Map(),
      _umpire: {
        kind: 'eitherOf' as const,
        groupName: 'group',
        constraint: 'enabled' as const,
        branches: {
          first: [orderingRule],
          second: [informationalRule],
        },
      },
    } as Rule<TestFields, TestConditions>

    expect(getGraphSourceInfo(rule)).toEqual({
      ordering: ['beta', 'gamma'],
      informational: [],
    })
  })

  test('returns undefined when eitherOf contains an uninspectable inner rule', () => {
    const opaqueRule: Rule<TestFields, TestConditions> = {
      type: 'opaque',
      targets: ['alpha'],
      sources: ['beta'],
      evaluate: () => new Map([['alpha', { enabled: true, reason: null }]]),
    }

    const rule = eitherOf<TestFields, TestConditions>('auth', {
      password: [enabledWhen('alpha', () => true)],
      opaque: [opaqueRule],
    })

    expect(inspectRule(rule)).toBeUndefined()
  })

  test('returns undefined when eitherOf has a mixed inspectable/uninspectable branch', () => {
    const opaqueRule: Rule<TestFields, TestConditions> = {
      type: 'opaque',
      targets: ['alpha'],
      sources: ['beta'],
      evaluate: () => new Map([['alpha', { enabled: true, reason: null }]]),
    }

    const rule = eitherOf<TestFields, TestConditions>('auth', {
      password: [enabledWhen('alpha', () => true), opaqueRule],
      backup: [enabledWhen('alpha', () => true)],
    })

    expect(inspectRule(rule)).toBeUndefined()
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
      'eitherOf',
      'enabledWhen',
      'fairWhen',
      'oneOf',
      'requires',
    ])
    expect(factories.enabledWhen('alpha', () => true).type).toBe('enabledWhen')
    expect(factories.anyOf).toBe(anyOf)
    expect(factories.eitherOf).toBe(eitherOf)
  })
})
