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

  test('disables with field source', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [disables('a', ['b'])],
    })
    const r = await ump.check({ a: 'present' })
    expect(r.b.enabled).toBe(false)
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
    }).toThrow()
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
})
