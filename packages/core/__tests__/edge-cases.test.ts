import { field } from '../src/field.js'
import { anyOf, check, disables, enabledWhen, oneOf, requires } from '../src/rules.js'
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
      alpha: { enabled: true, satisfied: false, fair: true, required: true, reason: null, reasons: [] },
      beta: { enabled: true, satisfied: false, fair: true, required: false, reason: null, reasons: [] },
      gamma: { enabled: true, satisfied: false, fair: true, required: false, reason: null, reasons: [] },
      delta: { enabled: true, satisfied: false, fair: true, required: false, reason: null, reasons: [] },
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
      satisfied: false,
      fair: true,
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
      satisfied: false,
      fair: true,
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

  test('validates oneOf() branch field references', () => {
    expect(() =>
      umpire<TestFields>({
        fields: {
          alpha: {},
          beta: {},
          gamma: {},
          delta: {},
        },
        rules: [
          oneOf<TestFields>('strategy', {
            first: ['alpha'],
            second: ['missing' as keyof TestFields & string],
          }),
        ],
      }),
    ).toThrow('Unknown field "missing" in oneOf("strategy") branch "second"')
  })

  test('rejects requires() when the same dependency also disables the target', () => {
    expect(() =>
      umpire<TestFields>({
        fields: {
          alpha: {},
          beta: {},
          gamma: {},
          delta: {},
        },
        rules: [
          // intentionally disabled because we're breaking this on purpose haha
          // eslint-disable-next-line @umpire/no-contradicting-rules
          disables<TestFields>('beta', ['delta']),
          requires<TestFields>('delta', 'beta'),
        ],
      }),
    ).toThrow(
      'Contradictory rules: "delta" can never be enabled because it requires "beta", but is disabled whenever "beta" is satisfied',
    )
  })

  test('rejects the same disables()/requires() contradiction with named builders', () => {
    const beta = field<string>('beta')
    const delta = field<string>('delta')

    expect(() =>
      umpire({
        fields: {
          alpha: field<string>('alpha'),
          beta,
          gamma: field<string>('gamma'),
          delta,
        },
        rules: [
          disables(beta, [delta]),
          requires(delta, beta),
        ],
      }),
    ).toThrow(
      'Contradictory rules: "delta" can never be enabled because it requires "beta", but is disabled whenever "beta" is satisfied',
    )
  })

  test('rejects cross-branch requires() dependencies in auto oneOf()', () => {
    expect(() =>
      umpire<TestFields>({
        fields: {
          alpha: {},
          beta: {},
          gamma: {},
          delta: {},
        },
        rules: [
          oneOf<TestFields>('strategy', {
            first: ['alpha'],
            second: ['beta'],
          }),
          requires<TestFields>('alpha', check('beta', (value) => value === 'ready')),
        ],
      }),
    ).toThrow(
      'Contradictory rules: "alpha" can never be enabled because it requires "beta", but oneOf("strategy") places them in different branches ("first" and "second")',
    )
  })

  test('rejects the same cross-branch contradiction with named builders', () => {
    const alpha = field<string>('alpha')
    const beta = field<string>('beta')

    expect(() =>
      umpire({
        fields: {
          alpha,
          beta,
          gamma: field<string>('gamma'),
          delta: field<string>('delta'),
        },
        rules: [
          oneOf('strategy', {
            first: [alpha],
            second: [beta],
          }),
          requires(alpha, beta),
        ],
      }),
    ).toThrow(
      'Contradictory rules: "alpha" can never be enabled because it requires "beta", but oneOf("strategy") places them in different branches ("first" and "second")',
    )
  })

  test('does not reject cross-branch requires() when oneOf() branch selection is dynamic', () => {
    expect(() =>
      umpire<TestFields, { mode: string }>({
        fields: {
          alpha: {},
          beta: {},
          gamma: {},
          delta: {},
        },
        rules: [
          oneOf<TestFields, { mode: string }>('strategy', {
            first: ['alpha'],
            second: ['beta'],
          }, {
            activeBranch: (_values, conditions) =>
              conditions.mode === 'all-open' ? null : 'first',
          }),
          requires<TestFields, { mode: string }>('alpha', 'beta'),
        ],
      }),
    ).not.toThrow()
  })

  test('precomputes rule target lookups at construction time', () => {
    let targetReads = 0
    const countedRule = new Proxy(enabledWhen<TestFields>('alpha', () => true), {
      get(target, prop, receiver) {
        if (prop === 'targets') {
          targetReads += 1
        }

        return Reflect.get(target, prop, receiver)
      },
    })

    const ump = umpire<TestFields>({
      fields: {
        alpha: {},
        beta: {},
        gamma: {},
        delta: {},
      },
      rules: [countedRule],
    })

    targetReads = 0
    ump.check({})
    ump.check({})

    expect(targetReads).toBe(0)
  })
})
