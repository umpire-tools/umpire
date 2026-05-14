import { umpire, enabledWhen, requires, fairWhen } from '@umpire/async'
import { describe, test, expect } from 'bun:test'

describe('async challenge()', () => {
  test('returns basic trace for a field', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', async (v: any) => v.a === 'on')],
    })

    const trace = await ump.challenge('b', { a: 'on' })
    expect(trace.field).toBe('b')
    expect(trace.enabled).toBe(true)
    expect(trace.directReasons.length).toBe(1)
  })

  test('directReasons includes rule type, index, and id', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', async (v: any) => v.a === 'on')],
    })

    const trace = await ump.challenge('b', { a: 'on' })
    expect(trace.directReasons[0]).toMatchObject({
      rule: 'enabledWhen',
      ruleIndex: 0,
      ruleId: expect.any(String),
      passed: true,
      reason: null,
    })
  })

  test('includes custom trace attachments from rule options', async () => {
    const ump = umpire({
      fields: { submit: {}, email: {} },
      rules: [
        enabledWhen('submit', async () => true, {
          trace: {
            kind: 'validator',
            id: 'email-domain',
            inspect(values) {
              return {
                value: values.email,
                reason: 'domain accepted',
                dependencies: [{ field: 'email', value: values.email }],
              }
            },
          },
        }),
      ],
    })

    const trace = await ump.challenge('submit', {
      submit: null,
      email: 'ada@example.com',
    })

    expect(trace.directReasons[0]?.trace).toEqual([
      {
        kind: 'validator',
        id: 'email-domain',
        value: 'ada@example.com',
        reason: 'domain accepted',
        dependencies: [{ field: 'email', value: 'ada@example.com' }],
      },
    ])
  })

  test('throws on unknown field', async () => {
    const ump = umpire({
      fields: { a: {} },
      rules: [],
    })

    await expect(ump.challenge('unknown' as any, { a: 'x' })).rejects.toThrow(
      'Unknown field',
    )
  })

  test('challenge is not cancelled by subsequent check', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', async (v: any) => v.a === 'on')],
    })

    const tracePromise = ump.challenge('b', { a: 'on' })
    await ump.check({ a: 'off' })
    const trace = await tracePromise
    expect(trace.field).toBe('b')
  })

  test('enabled reflects actual evaluation result', async () => {
    const ump = umpire({
      fields: { a: {} },
      rules: [enabledWhen('a', async () => false)],
    })

    const trace = await ump.challenge('a', { a: 'x' })
    expect(trace.enabled).toBe(false)
  })

  test('fair reflects actual evaluation result', async () => {
    const ump = umpire({
      fields: { a: {} },
      rules: [fairWhen('a', async (val: any) => val === 'good')],
    })

    const trace = await ump.challenge('a', { a: 'bad' })
    expect(trace.fair).toBe(false)
  })

  test('challenge accepts conditions parameter', async () => {
    const ump = umpire<any, { plan: string }>({
      fields: { a: {} },
      rules: [enabledWhen('a', (_v: any, c: any) => c.plan === 'pro')],
    })

    const trace = await ump.challenge('a', { a: 'x' }, { plan: 'pro' })
    expect(trace.enabled).toBe(true)

    const trace2 = await ump.challenge('a', { a: 'x' }, { plan: 'basic' })
    expect(trace2.enabled).toBe(false)
  })

  test('returns transitiveDeps as empty array', async () => {
    const ump = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [requires('c', 'b'), requires('b', 'a')],
    })

    const trace = await ump.challenge('c', { a: null, b: null })
    expect(trace.transitiveDeps).toEqual([])
  })

  test('returns oneOfResolution as null', async () => {
    const ump = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [],
    })

    const trace = await ump.challenge('a', { a: 'x' })
    expect(trace.oneOfResolution).toBeNull()
  })

  test('reports failing rule in directReasons', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', () => false, { reason: 'always off' })],
    })

    const trace = await ump.challenge('b', { a: 'x' })
    expect(trace.enabled).toBe(false)
    expect(trace.directReasons.length).toBe(1)
    expect(trace.directReasons[0].rule).toBe('enabledWhen')
    expect(trace.directReasons[0].passed).toBe(false)
    expect(trace.directReasons[0].reason).toBe('always off')
  })

  test('reports multiple rules for same field', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [requires('b', 'a'), enabledWhen('b', () => true)],
    })

    const trace = await ump.challenge('b', { a: 'ok' })
    expect(trace.directReasons.length).toBe(2)
  })
})
