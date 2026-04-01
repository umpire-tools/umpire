import { anyOf, check, enabledWhen, requires } from '../src/rules.js'
import { umpire } from '../src/umpire.js'

type TestFields = {
  alpha: { required?: boolean }
  beta: { required?: boolean }
  gamma: { required?: boolean }
  delta: { required?: boolean }
}

describe('edge cases', () => {
  test('returns all fields enabled when the rules array is empty', () => {
    const ump = umpire<TestFields>({
      fields: {
        alpha: { required: true },
        beta: {},
        gamma: {},
        delta: {},
      },
      rules: [],
    })

    expect(ump.check({})).toEqual({
      alpha: { enabled: true, required: true, reason: null, reasons: [] },
      beta: { enabled: true, required: false, reason: null, reasons: [] },
      gamma: { enabled: true, required: false, reason: null, reasons: [] },
      delta: { enabled: true, required: false, reason: null, reasons: [] },
    })
  })

  test('keeps fields enabled when all rule combinations pass', () => {
    const ump = umpire<TestFields>({
      fields: {
        alpha: {},
        beta: {},
        gamma: {},
        delta: {},
      },
      rules: [
        enabledWhen<TestFields>('beta', (values) => values.alpha === 'ready'),
        anyOf<TestFields>(
          enabledWhen<TestFields>('gamma', () => true, { reason: 'first failed' }),
          enabledWhen<TestFields>('gamma', () => false, { reason: 'second failed' }),
        ),
        requires<TestFields>('delta', 'beta'),
      ],
    })

    const result = ump.check({ alpha: 'ready', beta: 'set' })

    expect(result.beta.enabled).toBe(true)
    expect(result.gamma.enabled).toBe(true)
    expect(result.delta.enabled).toBe(true)
  })

  test('uses declaration order for reason precedence across rule types', () => {
    const ump = umpire<TestFields>({
      fields: {
        alpha: {},
        beta: {},
        gamma: {},
        delta: {},
      },
      rules: [
        enabledWhen<TestFields>('delta', () => false, { reason: 'first failure' }),
        requires<TestFields>('delta', 'beta', { reason: 'second failure' }),
      ],
    })

    expect(ump.check({}).delta).toEqual({
      enabled: false,
      required: false,
      reason: 'first failure',
      reasons: ['first failure', 'second failure'],
    })
  })

  test('includes a field with no rules in the result map', () => {
    const ump = umpire<TestFields>({
      fields: {
        alpha: {},
        beta: {},
        gamma: {},
        delta: {},
      },
      rules: [enabledWhen<TestFields>('alpha', () => true)],
    })

    expect(ump.check({}).delta).toEqual({
      enabled: true,
      required: false,
      reason: null,
      reasons: [],
    })
  })

  test('validates check() field references inside enabledWhen()', () => {
    expect(() =>
      umpire<TestFields>({
        fields: {
          alpha: {},
          beta: {},
          gamma: {},
          delta: {},
        },
        rules: [
          enabledWhen<TestFields>('alpha', check('missing' as keyof TestFields & string, () => true)),
        ],
      }),
    ).toThrow('Unknown field "missing" referenced by enabledWhen rule')
  })
})
