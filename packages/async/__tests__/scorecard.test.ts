import { umpire, defineRule, enabledWhen, requires } from '@umpire/async'
import { describe, test, expect } from 'bun:test'

describe('async scorecard()', () => {
  test('returns field statuses', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [],
    })

    const result = await ump.scorecard({ values: { a: 'x', b: null } })
    expect(result.fields.a.satisfied).toBe(true)
    expect(result.fields.b.satisfied).toBe(false)
  })

  test('detects changed fields with before', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', async (v: any) => v.a === 'on')],
    })

    const result = await ump.scorecard(
      { values: { a: 'on', b: 'present' } },
      { before: { values: { a: 'off', b: null } } },
    )

    expect(result.fields.a.changed).toBe(true)
    expect(result.transition.changedFields).toContain('a')
  })

  test('changed field detection supports fantasy-land/equals', async () => {
    const value = {
      id: 1,
      'fantasy-land/equals': (other: unknown) =>
        typeof other === 'object' && other !== null && (other as any).id === 1,
    }
    const ump = umpire({
      fields: { item: {} },
      rules: [],
    })

    const result = await ump.scorecard(
      { values: { item: { id: 1 } } },
      { before: { values: { item: value } } },
    )

    expect(result.fields.item.changed).toBe(false)
  })

  test('changed field detection supports equals methods', async () => {
    const value = {
      id: 1,
      equals: (other: unknown) =>
        typeof other === 'object' && other !== null && (other as any).id === 1,
    }
    const ump = umpire({
      fields: { item: {} },
      rules: [],
    })

    const result = await ump.scorecard(
      { values: { item: { id: 1 } } },
      { before: { values: { item: value } } },
    )

    expect(result.fields.item.changed).toBe(false)
  })

  test('changed field detection treats unequal objects as changed', async () => {
    const ump = umpire({
      fields: { item: {} },
      rules: [],
    })

    const result = await ump.scorecard(
      { values: { item: { id: 2 } } },
      { before: { values: { item: { id: 1 } } } },
    )

    expect(result.fields.item.changed).toBe(true)
  })

  test('changed field detection supports equals methods returning false', async () => {
    const value = {
      equals: () => false,
    }
    const ump = umpire({
      fields: { item: {} },
      rules: [],
    })

    const result = await ump.scorecard(
      { values: { item: { id: 1 } } },
      { before: { values: { item: value } } },
    )

    expect(result.fields.item.changed).toBe(true)
  })

  test('transition.before is null when no before provided', async () => {
    const ump = umpire({
      fields: { a: {} },
      rules: [],
    })

    const result = await ump.scorecard({ values: { a: 'x' } })
    expect(result.transition.before).toBeNull()
  })

  test('graph is a defensive copy', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [requires('b', 'a')],
    })

    const result = await ump.scorecard({ values: { a: 'set' } })
    result.graph.nodes.push('mutated')

    expect(ump.graph().nodes).toEqual(['a', 'b'])
  })

  test('detects cascading fields', async () => {
    const ump = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [requires('b', 'a'), requires('c', 'b')],
    })

    const result = await ump.scorecard(
      { values: { a: null, b: 'present', c: 'present' } },
      { before: { values: { a: 'ok', b: 'present', c: 'present' } } },
    )

    expect(result.transition.changedFields).toContain('a')
    expect(result.transition.cascadingFields).toContain('b')
    expect(result.transition.cascadingFields).toContain('c')
  })

  test('scorecard fields include incoming/outgoing edges', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [requires('b', 'a')],
    })

    const result = await ump.scorecard({ values: { a: 'x' } })
    expect(result.fields.a.outgoing).toEqual([{ field: 'b', type: 'requires' }])
    expect(result.fields.b.incoming).toEqual([{ field: 'a', type: 'requires' }])
  })

  test('scorecard includes validation results', async () => {
    const ump = umpire({
      fields: { email: {} },
      rules: [],
      validators: {
        email: {
          validator: (v: string) => v.includes('@'),
          error: 'Invalid email',
        },
      },
    })

    const result = await ump.scorecard({ values: { email: 'bad' } })
    expect(result.fields.email.valid).toBe(false)
    expect(result.fields.email.error).toBe('Invalid email')
  })

  test('scorecard includes check availability', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', () => false)],
    })

    const result = await ump.scorecard({ values: { a: 'x', b: 'y' } })
    expect(result.check.b.enabled).toBe(false)
    expect(result.check.b.required).toBe(false)
  })

  test('scorecard auto-fills missing keys', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [],
    })

    const result = await ump.scorecard({ values: { a: 'x' } })
    expect(result.fields.b.satisfied).toBe(false)
  })

  test('scorecard with includeChallenge adds trace', async () => {
    const ump = umpire({
      fields: { a: {} },
      rules: [enabledWhen('a', () => true)],
    })

    const result = await ump.scorecard(
      { values: { a: 'x' } },
      { includeChallenge: true },
    )

    expect(result.fields.a.trace).toBeDefined()
    expect(result.fields.a.trace!.field).toBe('a')
    expect(result.fields.a.trace!.enabled).toBe(true)
    expect(Array.isArray(result.fields.a.trace!.directReasons)).toBe(true)
    expect(result.fields.a.trace!.directReasons.length).toBeGreaterThan(0)
    for (const entry of result.fields.a.trace!.directReasons) {
      expect(typeof entry.passed).toBe('boolean')
      expect(typeof entry.reason === 'string' || entry.reason === null).toBe(
        true,
      )
    }
  })

  test('scorecard transition suggests fouls', async () => {
    const ump = umpire({
      fields: { toggle: {}, target: { default: 'reset' } },
      rules: [enabledWhen('target', (values: any) => values.toggle === 'on')],
    })

    const result = await ump.scorecard(
      { values: { toggle: 'off', target: 'stale' } },
      { before: { values: { toggle: 'on', target: 'stale' } } },
    )

    expect(result.transition.fouls).toEqual([
      {
        field: 'target',
        reason: 'condition not met',
        suggestedValue: 'reset',
      },
    ])
    expect(result.fields.target.foul?.suggestedValue).toBe('reset')
  })

  test('scorecard transition uses fallback disabled reason', async () => {
    const ump = umpire({
      fields: { toggle: {}, target: { default: 'reset' } },
      rules: [
        defineRule({
          type: 'custom',
          targets: ['target'],
          sources: ['toggle'],
          evaluate: async (values: any) =>
            new Map([
              ['target', { enabled: values.toggle === 'on', reason: null }],
            ]),
        }),
      ],
    })

    const result = await ump.scorecard(
      { values: { toggle: 'off', target: 'stale' } },
      { before: { values: { toggle: 'on', target: 'stale' } } },
    )

    expect(result.transition.fouls).toEqual([
      {
        field: 'target',
        reason: 'field disabled',
        suggestedValue: 'reset',
      },
    ])
  })

  test('scorecard transition ignores unchanged availability', async () => {
    const ump = umpire({
      fields: { target: {} },
      rules: [],
    })

    const result = await ump.scorecard(
      { values: { target: 'same' } },
      { before: { values: { target: 'same' } } },
    )

    expect(result.transition.fouls).toEqual([])
  })

  test('scorecard transition skips unsatisfied and defaulted fouls', async () => {
    const ump = umpire({
      fields: {
        toggle: {},
        emptyTarget: {},
        defaultedTarget: { default: 'reset' },
      },
      rules: [
        enabledWhen('emptyTarget', (values: any) => values.toggle === 'on'),
        enabledWhen('defaultedTarget', (values: any) => values.toggle === 'on'),
      ],
    })

    const result = await ump.scorecard(
      {
        values: { toggle: 'off', emptyTarget: null, defaultedTarget: 'reset' },
      },
      {
        before: {
          values: {
            toggle: 'on',
            emptyTarget: 'stale',
            defaultedTarget: 'stale',
          },
        },
      },
    )

    expect(result.transition.fouls).toEqual([])
  })

  test('scorecard without includeChallenge omits trace', async () => {
    const ump = umpire({
      fields: { a: {} },
      rules: [enabledWhen('a', () => true)],
    })

    const result = await ump.scorecard({ values: { a: 'x' } })
    expect(result.fields.a.trace).toBeUndefined()
  })
})
