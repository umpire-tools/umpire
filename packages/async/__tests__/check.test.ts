import {
  umpire,
  enabledWhen,
  requires,
  fairWhen,
  disables,
  eitherOf,
  defineRule,
} from '@umpire/async'
import { enabledWhen as coreEnabledWhen, field } from '@umpire/core'
import { describe, test, expect } from 'bun:test'

describe('async check()', () => {
  test('evaluates sync predicates', async () => {
    const ump = umpire({
      fields: { alpha: {}, beta: {} },
      rules: [enabledWhen('beta', (values: any) => values.alpha === 'on')],
    })
    const result = await ump.check({ alpha: 'on' })
    expect(result.beta.enabled).toBe(true)
    const result2 = await ump.check({ alpha: 'off' })
    expect(result2.beta.enabled).toBe(false)
  })

  test('evaluates async predicates', async () => {
    const ump = umpire({
      fields: { alpha: {}, beta: {} },
      rules: [
        enabledWhen('beta', async (values: any) => {
          return values.alpha === 'on'
        }),
      ],
    })
    const result = await ump.check({ alpha: 'on' })
    expect(result.beta.enabled).toBe(true)
  })

  test('mixes sync and async rules', async () => {
    const ump = umpire({
      fields: { alpha: {}, beta: {}, gamma: {} },
      rules: [
        requires('gamma', 'beta'),
        enabledWhen('beta', async (values: any) => {
          return values.alpha === 'yes'
        }),
      ],
    })
    const result = await ump.check({ alpha: 'yes', beta: 'present' })
    expect(result.gamma.enabled).toBe(true)
    expect(result.beta.enabled).toBe(true)
  })

  test('wraps top-level core rules with evaluateTarget metadata', async () => {
    const ump = umpire({
      fields: { alpha: {} },
      rules: [coreEnabledWhen('alpha', () => false)],
    })

    const result = await ump.check({ alpha: 'x' })
    expect(result.alpha.enabled).toBe(false)
  })

  test('custom rule missing target evaluation uses default availability', async () => {
    const ump = umpire({
      fields: { alpha: {} },
      rules: [
        defineRule({
          type: 'custom',
          targets: ['alpha'],
          evaluate: async () => new Map(),
        }),
      ],
    })

    const result = await ump.check({ alpha: 'x' })
    expect(result.alpha.enabled).toBe(true)
  })

  test('custom rule empty reasons are normalized away', async () => {
    const ump = umpire({
      fields: { alpha: {} },
      rules: [
        defineRule({
          type: 'custom',
          targets: ['alpha'],
          evaluate: async () =>
            new Map([
              ['alpha', { enabled: false, reason: 'blocked', reasons: [] }],
            ]),
        }),
      ],
    })

    const result = await ump.check({ alpha: 'x' })
    expect(result.alpha.enabled).toBe(false)
    expect(result.alpha.reasons).toEqual(['blocked'])
  })

  test('async disabled field reports required: false', async () => {
    const ump = umpire({
      fields: { alpha: {}, beta: { required: true } },
      rules: [enabledWhen('beta', async () => false)],
    })
    const result = await ump.check({ alpha: 'x' })
    expect(result.beta.enabled).toBe(false)
    expect(result.beta.required).toBe(false)
  })

  test('multiple rules on same target are ANDed', async () => {
    const ump = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [requires('c', 'a'), requires('c', 'b')],
    })
    const result = await ump.check({ a: 'ok', b: null })
    expect(result.c.enabled).toBe(false)
  })

  test('check accepts partial values', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', () => true)],
    })
    const result = await ump.check({ a: 'x' })
    expect(result.b.satisfied).toBe(false)
  })

  test('no rules: all fields enabled, fair, with correct required', async () => {
    const ump = umpire({
      fields: { alpha: { required: true }, beta: {} },
      rules: [],
    })
    const result = await ump.check({ alpha: 'present' })
    expect(result.alpha.enabled).toBe(true)
    expect(result.alpha.required).toBe(true)
    expect(result.alpha.satisfied).toBe(true)
    expect(result.alpha.fair).toBe(true)
    expect(result.beta.enabled).toBe(true)
    expect(result.beta.required).toBe(false)
    expect(result.beta.satisfied).toBe(false)
  })

  test('fairWhen with async predicate on unsatisfied field returns fair: true', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [fairWhen('b', async (val: any) => val === 'good')],
    })
    const result = await ump.check({ a: 'x' })
    expect(result.b.fair).toBe(true)
  })

  test('fairWhen with async predicate on satisfied field', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [fairWhen('b', async (val: any) => val === 'good')],
    })
    const r = await ump.check({ b: 'good' })
    expect(r.b.fair).toBe(true)
    const r2 = await ump.check({ b: 'bad' })
    expect(r2.b.fair).toBe(false)
  })

  test('ANDs gate rules and keeps first failure reason', async () => {
    const ump = umpire({
      fields: { a: {} },
      rules: [
        enabledWhen('a', () => false, { reason: 'first' }),
        enabledWhen('a', () => false, { reason: 'second' }),
      ],
    })
    const result = await ump.check({ a: 'x' })
    expect(result.a.enabled).toBe(false)
    expect(result.a.reason).toBe('first')
    expect(result.a.reasons).toEqual(['first', 'second'])
  })

  test('requires predicate dependency', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [requires('b', (values: any) => values.a === 'allow')],
    })
    const r = await ump.check({ a: 'allow' })
    expect(r.b.enabled).toBe(true)
    const r2 = await ump.check({ a: 'deny' })
    expect(r2.b.enabled).toBe(false)
  })

  test('conditions are passed to predicates', async () => {
    const ump = umpire<any, { plan: string }>({
      fields: { a: {} },
      rules: [
        enabledWhen(
          'a',
          (_values: any, conditions: any) => conditions.plan === 'pro',
          {
            reason: 'pro required',
          },
        ),
      ],
    })
    const r = await ump.check({ a: 'x' }, { plan: 'pro' })
    expect(r.a.enabled).toBe(true)
    const r2 = await ump.check({ a: 'x' }, { plan: 'basic' })
    expect(r2.a.enabled).toBe(false)
    expect(r2.a.reason).toBe('pro required')
  })

  test('disables blocks a target field when source is satisfied', async () => {
    const ump = umpire({
      fields: { source: {}, target: {} },
      rules: [disables('source', ['target'])],
    })
    const r = await ump.check({ source: 'active' })
    expect(r.target.enabled).toBe(false)
    const r2 = await ump.check({ source: null })
    expect(r2.target.enabled).toBe(true)
  })

  test('eitherOf primary branch passes', async () => {
    const ump = umpire({
      fields: { primary: {}, fallback: {}, target: {} },
      rules: [
        eitherOf('strategy', {
          primary: [
            enabledWhen('target', (values: any) => Boolean(values.primary)),
          ],
          fallback: [
            enabledWhen('target', (values: any) => Boolean(values.fallback)),
          ],
        }),
      ],
    })

    const result = await ump.check({ primary: 'yes', fallback: null })
    expect(result.target.enabled).toBe(true)
  })

  test('eitherOf all branches fail', async () => {
    const ump = umpire({
      fields: { primary: {}, fallback: {}, target: {} },
      rules: [
        eitherOf('strategy', {
          primary: [
            enabledWhen('target', (values: any) => Boolean(values.primary)),
          ],
          fallback: [
            enabledWhen('target', (values: any) => Boolean(values.fallback)),
          ],
        }),
      ],
    })

    const result = await ump.check({ primary: null, fallback: null })
    expect(result.target.enabled).toBe(false)
  })

  test('requires observes upstream disabled fields — transitive availability', async () => {
    const ump = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [enabledWhen('b', () => false), requires('c', 'b')],
    })
    const r = await ump.check({ a: 'x', b: 'present' })
    expect(r.b.enabled).toBe(false)
    expect(r.c.enabled).toBe(false)
    expect(r.c.reason).toBe('requires b')
  })

  test('validates rules attached by field builders', () => {
    expect(() =>
      umpire({
        fields: {
          a: {},
          b: field().requires('a'),
        },
        rules: [disables('a', ['b'])],
      }),
    ).toThrow('Contradictory rules')
  })

  test('enabled field keeps FieldDef.required', async () => {
    const ump = umpire({
      fields: { name: { required: true } },
      rules: [enabledWhen('name', () => true)],
    })
    const r = await ump.check({ name: 'present' })
    expect(r.name.enabled).toBe(true)
    expect(r.name.required).toBe(true)
    expect(r.name.satisfied).toBe(true)
  })

  test('default reason from enabledWhen when no reason provided', async () => {
    const ump = umpire({
      fields: { a: {} },
      rules: [enabledWhen('a', () => false)],
    })
    const r = await ump.check({ a: 'x' })
    expect(r.a.enabled).toBe(false)
    expect(r.a.reason).toBe('condition not met')
  })

  test('init() returns default values', () => {
    const ump = umpire({
      fields: { a: { default: 'hello' }, b: {} },
      rules: [],
    })
    const values = ump.init()
    expect(values.a).toBe('hello')
    expect(values.b).toBeUndefined()
  })

  test('init() accepts overrides', () => {
    const ump = umpire({
      fields: { a: { default: 'hello' } },
      rules: [],
    })
    const values = ump.init({ a: 'override' })
    expect(values.a).toBe('override')
  })

  test('rules() returns rule entries with id', () => {
    const ump = umpire({
      fields: { a: {} },
      rules: [enabledWhen('a', () => true)],
    })
    const entries = ump.rules()
    expect(entries.length).toBe(1)
    expect(typeof entries[0].id).toBe('string')
    expect(entries[0].id.length).toBeGreaterThan(0)
  })

  test('graph() returns defensive copy', () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [requires('b', 'a')],
    })
    const g1 = ump.graph()
    const g2 = ump.graph()
    expect(g1).toEqual(g2)
    g1.nodes.push('fake' as never)
    expect(g2.nodes.length).toBe(2)
  })
})
