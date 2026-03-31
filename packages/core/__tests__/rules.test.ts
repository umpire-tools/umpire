import {
  anyOf,
  check,
  disables,
  enabledWhen,
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
})

describe('oneOf', () => {
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
})

describe('anyOf', () => {
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
})

describe('check', () => {
  test('supports function validators', () => {
    const predicate = check<TestFields, TestConditions>('alpha', (value) => value === 'ok')

    expect(predicate({ alpha: 'ok' }, { allow: true })).toBe(true)
    expect(predicate({ alpha: 'nope' }, { allow: true })).toBe(false)
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
})
