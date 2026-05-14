import {
  umpire,
  enabledWhen,
  fairWhen,
  requires,
  disables,
  oneOf,
  anyOf,
  eitherOf,
  check,
  defineRule,
  createRules,
} from '@umpire/async'
import { enabledWhen as coreEnabledWhen, field } from '@umpire/core'
import { describe, test, expect } from 'bun:test'

describe('async builders', () => {
  test('enabledWhen with async predicate', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', async (v: any) => v.a === 'yes')],
    })
    const r = await ump.check({ a: 'yes' })
    expect(r.b.enabled).toBe(true)
    const r2 = await ump.check({ a: 'no' })
    expect(r2.b.enabled).toBe(false)
  })

  test('fairWhen with async predicate', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [fairWhen('b', async (val: any) => val === 'good')],
    })
    const r = await ump.check({ b: 'good' })
    expect(r.b.fair).toBe(true)
    const r2 = await ump.check({ b: 'bad' })
    expect(r2.b.fair).toBe(false)
  })

  test('requires with mixed sync+async deps', async () => {
    const ump = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [requires('c', 'a'), enabledWhen('a', async () => true)],
    })
    const r = await ump.check({ a: 'ok' })
    expect(r.c.enabled).toBe(true)
  })

  test('requires check dependency fails when source field is disabled', async () => {
    const ump = umpire({
      fields: { email: {}, submit: {} },
      rules: [
        enabledWhen('email', () => false),
        requires(
          'submit',
          check('email', (v: string) => v.includes('@')),
        ),
      ],
    })

    const result = await ump.check({ email: 'test@example.com' })
    expect(result.email.enabled).toBe(false)
    expect(result.submit.enabled).toBe(false)
  })

  test('disables with field source', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [disables('a', ['b'])],
    })
    const r = await ump.check({ a: 'present' })
    expect(r.b.enabled).toBe(false)
  })

  test('disables with predicate source uses default condition reason', async () => {
    const ump = umpire({
      fields: { source: {}, target: {} },
      rules: [
        disables((values: any) => values.source === 'active', ['target']),
      ],
    })

    const result = await ump.check({ source: 'active', target: 'x' })
    expect(result.target.enabled).toBe(false)
    expect(result.target.reason).toBe('overridden by condition')
  })

  test('disables with check predicate source uses field label', async () => {
    const ump = umpire({
      fields: { source: {}, target: {} },
      rules: [
        disables(
          check('source', (value: string) => value === 'active'),
          ['target'],
        ),
      ],
    })

    const result = await ump.check({ source: 'active', target: 'x' })
    expect(result.target.enabled).toBe(false)
    expect(result.target.reason).toBe('overridden by source')
  })

  test('composite anyOf with mixed rules', async () => {
    const ump = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [
        anyOf(
          enabledWhen('c', async () => false),
          enabledWhen('c', async () => true),
        ),
      ],
    })
    const r = await ump.check({ c: null })
    expect(r.c.enabled).toBe(true)
  })

  test('anyOf with all failing rules disables target', async () => {
    const ump = umpire({
      fields: { a: {} },
      rules: [
        anyOf(
          enabledWhen('a', async () => false, { reason: 'first' }),
          enabledWhen('a', async () => false, { reason: 'second' }),
        ),
      ],
    })
    const r = await ump.check({ a: 'x' })
    expect(r.a.enabled).toBe(false)
  })

  test('defineRule with async evaluate', async () => {
    const ump = umpire({
      fields: { a: {} },
      rules: [
        defineRule({
          type: 'customAsync',
          targets: ['a'],
          sources: [],
          evaluate: async () => {
            return new Map([['a', { enabled: true, reason: null }]])
          },
        }),
      ],
    })
    const r = await ump.check({ a: 'x' })
    expect(r.a.enabled).toBe(true)
  })

  test('defineRule async evaluation with fair constraint', async () => {
    const ump = umpire({
      fields: { a: {} },
      rules: [
        defineRule({
          type: 'customFairAsync',
          targets: ['a'],
          sources: [],
          constraint: 'fair',
          evaluate: async (values: any) => {
            const isFair = values.a === 'good'
            return new Map([
              [
                'a',
                {
                  enabled: true,
                  fair: isFair,
                  reason: isFair ? null : 'bad value',
                },
              ],
            ])
          },
        }),
      ],
    })
    const r = await ump.check({ a: 'good' })
    expect(r.a.fair).toBe(true)
    const r2 = await ump.check({ a: 'bad' })
    expect(r2.a.fair).toBe(false)
  })

  test('check() predicate builder integrates with rules', async () => {
    const ump = umpire({
      fields: { email: {}, submit: {} },
      rules: [
        enabledWhen(
          'submit',
          check('email', (v: string) => v.includes('@')),
          { reason: 'invalid email' },
        ),
      ],
    })
    const r = await ump.check({ email: 'test@test.com' })
    expect(r.submit.enabled).toBe(true)
    const r2 = await ump.check({ email: 'bad' })
    expect(r2.submit.enabled).toBe(false)
  })

  test('check() preserves named check metadata and params', async () => {
    const namedCheck = {
      __check: 'minLength',
      params: { min: 3 },
      validate: (value: string) => value.length >= 3,
    }
    const predicate = check('name', namedCheck)

    expect((predicate as any)._namedCheck).toEqual({
      __check: 'minLength',
      params: { min: 3 },
    })

    const ump = umpire({
      fields: { name: {}, submit: {} },
      rules: [enabledWhen('submit', predicate)],
    })
    const result = await ump.check({ name: 'Al' })
    expect(result.submit.enabled).toBe(false)
  })

  test('check() preserves named check metadata without params', () => {
    const namedCheck = {
      __check: 'nonEmpty',
      validate: (value: string) => value.length > 0,
    }
    const predicate = check('name', namedCheck)

    expect((predicate as any)._namedCheck).toEqual({
      __check: 'nonEmpty',
    })
  })

  test('check() supports async validation results', async () => {
    const ump = umpire({
      fields: { code: {}, submit: {} },
      rules: [
        enabledWhen(
          'submit',
          check('code', async (value: string) => ({
            valid: value === 'ok',
          })),
        ),
      ],
    })

    const result = await ump.check({ code: 'nope' })
    expect(result.submit.enabled).toBe(false)
  })

  test('check() supports safeParseAsync validators', async () => {
    const ump = umpire({
      fields: { code: {}, submit: {} },
      rules: [
        enabledWhen(
          'submit',
          check('code', {
            safeParseAsync: async (value: string) => ({
              success: value === 'ok',
            }),
          }),
        ),
      ],
    })

    const result = await ump.check({ code: 'ok' })
    expect(result.submit.enabled).toBe(true)
  })

  test('check() supports core validator objects', async () => {
    const ump = umpire({
      fields: { code: {}, submit: {} },
      rules: [
        enabledWhen(
          'submit',
          check('code', {
            safeParse: (value: string) => ({ success: value === 'ok' }),
          } as never),
        ),
      ],
    })

    const result = await ump.check({ code: 'nope' })
    expect(result.submit.enabled).toBe(false)
  })

  test('builders reject unnamed field selectors', () => {
    expect(() => enabledWhen(field(), () => true)).toThrow(
      'Named field builder required',
    )
    expect(() => oneOf('strategy', { hourly: [field()] })).toThrow(
      'Named field builder required',
    )
  })

  test('builders accept named field selectors', async () => {
    const name = field<string>('name')
    const submit = field('submit')
    const ump = umpire({
      fields: { name, submit },
      rules: [requires(submit, name)],
    })

    const result = await ump.check({ name: 'Ada' })
    expect(result.submit.enabled).toBe(true)
  })

  test('check() with null/undefined value returns false', async () => {
    const ump = umpire({
      fields: { email: {}, submit: {} },
      rules: [
        enabledWhen(
          'submit',
          check('email', (v: string) => v.includes('@')),
        ),
      ],
    })
    const r = await ump.check({ email: null })
    expect(r.submit.enabled).toBe(false)
  })

  test('createRules returns typed builders', () => {
    const { enabledWhen: ew } = createRules()
    expect(typeof ew).toBe('function')
  })

  test('createRules all builders are functions', () => {
    const builders = createRules()
    expect(typeof builders.defineRule).toBe('function')
    expect(typeof builders.enabledWhen).toBe('function')
    expect(typeof builders.fairWhen).toBe('function')
    expect(typeof builders.disables).toBe('function')
    expect(typeof builders.requires).toBe('function')
    expect(typeof builders.oneOf).toBe('function')
    expect(typeof builders.anyOf).toBe('function')
    expect(typeof builders.eitherOf).toBe('function')
    expect(typeof builders.check).toBe('function')
  })

  test('requires throws when no dependencies provided', () => {
    expect(() => requires('field')).toThrow('requires at least one dependency')
  })

  test('anyOf throws when no rules provided', () => {
    expect(() => anyOf()).toThrow('anyOf() requires at least one rule')
  })

  test('eitherOf with branch integration', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [
        eitherOf('auth', {
          primary: [
            enabledWhen('b', () => false, { reason: 'primary failed' }),
          ],
          fallback: [enabledWhen('b', () => true)],
        }),
      ],
    })
    const r = await ump.check({ b: 'x' })
    expect(r.b.enabled).toBe(true)
  })

  test('eitherOf all branches failing disables target', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [
        eitherOf('auth', {
          primary: [enabledWhen('b', () => false, { reason: 'p fail' })],
          fallback: [enabledWhen('b', () => false, { reason: 'f fail' })],
        }),
      ],
    })
    const r = await ump.check({ b: 'x' })
    expect(r.b.enabled).toBe(false)
  })

  test('oneOf with field branches', async () => {
    const ump = umpire({
      fields: { hourList: {}, startTime: {}, endTime: {} },
      rules: [
        oneOf('strategy', {
          hourly: ['hourList'],
          range: ['startTime', 'endTime'],
        }),
      ],
    })
    const r = await ump.check({ startTime: '09:00', endTime: '10:00' })
    expect(r.startTime.enabled).toBe(true)
    expect(r.endTime.enabled).toBe(true)
    expect(r.hourList.enabled).toBe(false)
  })

  test('oneOf with function activeBranch', async () => {
    const ump = umpire({
      fields: { mode: {}, hourList: {}, startTime: {}, endTime: {} },
      rules: [
        oneOf(
          'strategy',
          {
            hourly: ['hourList'],
            range: ['startTime', 'endTime'],
          },
          {
            activeBranch: async (values: any) =>
              values.mode === 'range' ? 'range' : null,
          },
        ),
      ],
    })

    const r = await ump.check({ mode: 'range', hourList: 'all-day' })
    expect(r.startTime.enabled).toBe(true)
    expect(r.endTime.enabled).toBe(true)
    expect(r.hourList.enabled).toBe(false)
  })

  test('oneOf rejects unknown async activeBranch result', async () => {
    const ump = umpire({
      fields: { mode: {}, hourList: {}, startTime: {} },
      rules: [
        oneOf(
          'strategy',
          {
            hourly: ['hourList'],
            range: ['startTime'],
          },
          {
            activeBranch: async () => 'missing' as never,
          },
        ),
      ],
    })

    await expect(ump.check({ mode: 'range' })).rejects.toThrow(
      'Unknown active branch "missing" for oneOf("strategy")',
    )
  })

  test('dynamic reason function resolves in challenge trace', async () => {
    const ump = umpire({
      fields: { someField: {}, target: {} },
      rules: [
        enabledWhen('target', async () => false, {
          reason: async (values: any) => `dynamic: ${values.someField}`,
        }),
      ],
    })

    const trace = await ump.challenge('target', {
      someField: 'blocked',
      target: 'x',
    })

    expect(trace.directReasons).toHaveLength(1)
    expect(trace.directReasons[0].reason).toBe('dynamic: blocked')
  })

  test('anyOf rejects mismatched targets', () => {
    expect(() =>
      anyOf(
        enabledWhen('a', () => true),
        enabledWhen('b', () => true),
      ),
    ).toThrow('target the same fields')
  })

  test('anyOf rejects mixed constraints', () => {
    const { enabledWhen: ew, fairWhen: fw } = createRules<{ a: any; b: any }>()
    expect(() =>
      anyOf(
        ew('a', () => true),
        fw('a', () => true),
      ),
    ).toThrow('mix')
  })

  test('eitherOf rejects empty branches', () => {
    expect(() => {
      eitherOf('test', {})
    }).toThrow('at least one branch')
    expect(() => {
      eitherOf('test', { primary: [] })
    }).toThrow('branch "primary" must not be empty')
  })

  test('oneOf rejects empty branches', () => {
    expect(() => {
      oneOf('test', {})
    }).toThrow()
  })

  test('oneOf rejects duplicate field across branches', () => {
    expect(() => {
      oneOf('test', { a: ['x'], b: ['x'] })
    }).toThrow('multiple branches')
  })

  test('oneOf rejects empty branch and unknown static active branch', () => {
    expect(() => {
      oneOf('test', { a: [] })
    }).toThrow('must not be empty')
    expect(() => {
      oneOf('test', { a: ['x'] }, { activeBranch: 'missing' as never })
    }).toThrow('Unknown active branch "missing"')
  })

  test('oneOf leaves all fields enabled when no branch is active', async () => {
    const ump = umpire({
      fields: { hourList: {}, startTime: {} },
      rules: [
        oneOf('strategy', { hourly: ['hourList'], range: ['startTime'] }),
      ],
    })

    const result = await ump.check({ hourList: null, startTime: null })
    expect(result.hourList.enabled).toBe(true)
    expect(result.startTime.enabled).toBe(true)
  })

  test('composite rules wrap sync core inner rules', async () => {
    const any = umpire({
      fields: { target: {} },
      rules: [
        anyOf(
          coreEnabledWhen('target', () => false),
          enabledWhen('target', () => true),
        ),
      ],
    })
    expect((await any.check({ target: 'x' })).target.enabled).toBe(true)

    const either = umpire({
      fields: { target: {} },
      rules: [
        eitherOf('strategy', {
          primary: [coreEnabledWhen('target', () => false)],
          fallback: [enabledWhen('target', () => true)],
        }),
      ],
    })
    expect((await either.check({ target: 'x' })).target.enabled).toBe(true)
  })
})
