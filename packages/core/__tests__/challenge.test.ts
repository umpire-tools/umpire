import { anyOf, check, defineRule, disables, enabledWhen, fairWhen, oneOf, requires } from '../src/rules.js'
import { umpire } from '../src/umpire.js'

type TestFields = {
  email: {}
  password: {}
  submit: {}
  dates: {}
  startTime: {}
  endTime: {}
  everyHour: {}
  repeatEvery: {}
}

type TestConditions = {
  captchaToken?: string
}

describe('challenge', () => {
  test('includes all direct reasons, including passed rules', () => {
    const ump = umpire<TestFields, TestConditions>({
      fields: {
        email: {},
        password: {},
        submit: {},
        dates: {},
        startTime: {},
        endTime: {},
        everyHour: {},
        repeatEvery: {},
      },
      rules: [
        enabledWhen<TestFields, TestConditions>(
          'submit',
          (_values, conditions) => !!conditions.captchaToken,
          { reason: 'Complete the captcha to continue' },
        ),
        requires<TestFields, TestConditions>('submit', 'email', {
          reason: 'Enter a valid email address',
        }),
        enabledWhen<TestFields, TestConditions>('submit', (values) => values.password === 'secret', {
          reason: 'Enter a password',
        }),
      ],
    })

    const challenge = ump.challenge('submit', { password: 'secret' }, {})

    expect(challenge.enabled).toBe(false)
    expect(challenge.directReasons).toHaveLength(3)
    expect(challenge.directReasons).toEqual([
      expect.objectContaining({
        rule: 'enabledWhen',
        passed: false,
        reason: 'Complete the captcha to continue',
      }),
      expect.objectContaining({
        rule: 'requires',
        passed: false,
        reason: 'Enter a valid email address',
      }),
      expect.objectContaining({
        rule: 'enabledWhen',
        passed: true,
        reason: null,
      }),
    ])
  })

  test('follows transitive requires chains', () => {
    const ump = umpire<TestFields>({
      fields: {
        email: {},
        password: {},
        submit: {},
        dates: {},
        startTime: {},
        endTime: {},
        everyHour: {},
        repeatEvery: {},
      },
      rules: [
        disables<TestFields>('dates', ['startTime']),
        requires<TestFields>('endTime', 'startTime'),
        requires<TestFields>('submit', 'endTime'),
      ],
    })

    const challenge = ump.challenge('submit', {
      dates: ['2026-04-01'],
      startTime: '09:00',
      endTime: '10:00',
    })

    expect(challenge.directReasons).toEqual([
      expect.objectContaining({
        rule: 'requires',
        dependency: 'endTime',
        satisfied: true,
        dependencyEnabled: false,
      }),
    ])
    expect(challenge.transitiveDeps).toEqual([
      expect.objectContaining({
        field: 'endTime',
        enabled: false,
        reason: 'requires startTime',
      }),
      expect.objectContaining({
        field: 'startTime',
        enabled: false,
        reason: 'overridden by dates',
      }),
    ])
    expect(challenge.transitiveDeps[0]?.causedBy).toEqual([
      expect.objectContaining({
        rule: 'requires',
        dependency: 'startTime',
      }),
    ])
    expect(challenge.transitiveDeps[1]?.causedBy).toEqual([
      expect.objectContaining({
        rule: 'disables',
        source: 'dates',
      }),
    ])
  })

  test('follows nested requires chains inside anyOf rules', () => {
    const ump = umpire<TestFields>({
      fields: {
        email: {},
        password: {},
        submit: {},
        dates: {},
        startTime: {},
        endTime: {},
        everyHour: {},
        repeatEvery: {},
      },
      rules: [
        disables<TestFields>('dates', ['startTime']),
        anyOf<TestFields>(
          requires('endTime', 'startTime'),
          enabledWhen('endTime', () => false, { reason: 'fallback failed' }),
        ),
        requires<TestFields>('submit', 'endTime'),
      ],
    })

    const challenge = ump.challenge('submit', {
      dates: ['2026-04-01'],
      startTime: '09:00',
      endTime: '10:00',
    })

    expect(challenge.transitiveDeps).toEqual([
      expect.objectContaining({
        field: 'endTime',
        enabled: false,
        reason: 'requires startTime',
        causedBy: [
          expect.objectContaining({
            rule: 'anyOf',
            inner: [
              expect.objectContaining({ rule: 'requires', dependency: 'startTime' }),
              expect.objectContaining({ rule: 'enabledWhen', reason: 'fallback failed' }),
            ],
          }),
        ],
      }),
      expect.objectContaining({
        field: 'startTime',
        enabled: false,
        reason: 'overridden by dates',
      }),
    ])
  })

  test('reports oneOf resolution state', () => {
    const ump = umpire<TestFields>({
      fields: {
        email: {},
        password: {},
        submit: {},
        dates: {},
        startTime: {},
        endTime: {},
        everyHour: {},
        repeatEvery: {},
      },
      rules: [
        oneOf<TestFields>('subDayStrategy', {
          hourList: ['everyHour'],
          interval: ['startTime', 'endTime', 'repeatEvery'],
        }),
      ],
    })

    const challenge = ump.challenge('everyHour', {
      startTime: '09:00',
      endTime: '10:00',
    })

    expect(challenge.oneOfResolution).toEqual({
      group: 'subDayStrategy',
      activeBranch: 'interval',
      method: 'auto-detected',
      branches: {
        hourList: { fields: ['everyHour'], anySatisfied: false },
        interval: { fields: ['startTime', 'endTime', 'repeatEvery'], anySatisfied: true },
      },
    })
    expect(challenge.directReasons).toEqual([
      expect.objectContaining({
        rule: 'oneOf',
        activeBranch: 'interval',
        thisBranch: 'hourList',
      }),
    ])
  })

  test('nests inner results for anyOf rules', () => {
    const ump = umpire<TestFields>({
      fields: {
        email: {},
        password: {},
        submit: {},
        dates: {},
        startTime: {},
        endTime: {},
        everyHour: {},
        repeatEvery: {},
      },
      rules: [
        anyOf<TestFields>(
          enabledWhen<TestFields>('submit', () => false, { reason: 'first failed' }),
          enabledWhen<TestFields>('submit', () => false, { reason: 'second failed' }),
        ),
      ],
    })

    const challenge = ump.challenge('submit', {})

    expect(challenge.directReasons).toEqual([
      expect.objectContaining({
        rule: 'anyOf',
        passed: false,
        inner: [
          expect.objectContaining({ rule: 'enabledWhen', reason: 'first failed', passed: false }),
          expect.objectContaining({ rule: 'enabledWhen', reason: 'second failed', passed: false }),
        ],
      }),
    ])
  })

  test('surfaces preserved field metadata for check()-based predicates', () => {
    const ump = umpire<TestFields>({
      fields: {
        email: {},
        password: {},
        submit: {},
        dates: {},
        startTime: {},
        endTime: {},
        everyHour: {},
        repeatEvery: {},
      },
      rules: [
        enabledWhen<TestFields>(
          'submit',
          check('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/),
          { reason: 'Enter a valid email address' },
        ),
        requires<TestFields>(
          'submit',
          check('password', (value) => typeof value === 'string' && value.length >= 8),
          { reason: 'Enter a longer password' },
        ),
        disables<TestFields>(
          check('dates', (value) => Array.isArray(value) && value.length > 0),
          ['startTime'],
          { reason: 'Dates override start time' },
        ),
      ],
    })

    const submitTrace = ump.challenge('submit', {
      email: 'not-an-email',
      password: 'short',
    })

    expect(submitTrace.directReasons).toEqual([
      expect.objectContaining({
        rule: 'enabledWhen',
        source: 'email',
        sourceValue: 'not-an-email',
        passed: false,
      }),
      expect.objectContaining({
        rule: 'requires',
        dependency: 'password',
        dependencyValue: 'short',
        satisfied: false,
      }),
    ])

    const startTimeTrace = ump.challenge('startTime', {
      dates: ['2026-04-01'],
      startTime: '09:00',
    })

    expect(startTimeTrace.directReasons).toEqual([
      expect.objectContaining({
        rule: 'disables',
        source: 'dates',
        sourceValue: ['2026-04-01'],
        sourceSatisfied: true,
        passed: false,
      }),
    ])
  })

  test('includes custom trace attachments from rule options', () => {
    const ump = umpire<{
      cpu: {}
      motherboard: {}
    }>({
      fields: {
        cpu: {},
        motherboard: {},
      },
      rules: [
        fairWhen('motherboard', (value, values) => value === values.cpu, {
          reason: 'Selected motherboard no longer matches the CPU socket',
          trace: {
            kind: 'read',
            id: 'motherboardFair',
            inspect(values) {
              return {
                value: values.motherboard === values.cpu,
                dependencies: [
                  { kind: 'field', id: 'cpu' },
                  { kind: 'field', id: 'motherboard' },
                ],
              }
            },
          },
        }),
      ],
    })

    const challenge = ump.challenge('motherboard', {
      cpu: 'amd-r7',
      motherboard: 'intel-z790',
    })

    expect(challenge.directReasons).toEqual([
      expect.objectContaining({
        rule: 'fair',
        passed: false,
        reason: 'Selected motherboard no longer matches the CPU socket',
        trace: [
          {
            kind: 'read',
            id: 'motherboardFair',
            value: false,
            dependencies: [
              { kind: 'field', id: 'cpu' },
              { kind: 'field', id: 'motherboard' },
            ],
          },
        ],
      }),
    ])
  })

  test('reports pass/fail for fair custom rules using the fair constraint', () => {
    const ump = umpire<{
      cpu: {}
      motherboard: {}
    }>({
      fields: {
        cpu: {},
        motherboard: {},
      },
      rules: [
        defineRule({
          type: 'socketFair',
          targets: ['motherboard'],
          sources: ['cpu'],
          constraint: 'fair',
          evaluate(values) {
            const matches = values.cpu === values.motherboard

            return new Map([
              ['motherboard', {
                enabled: true,
                fair: matches,
                reason: matches ? null : 'Selected motherboard no longer matches the CPU socket',
              }],
            ])
          },
        }),
      ],
    })

    const challenge = ump.challenge('motherboard', {
      cpu: 'amd-r7',
      motherboard: 'intel-z790',
    })

    expect(challenge.directReasons).toEqual([
      expect.objectContaining({
        rule: 'socketFair',
        passed: false,
        reason: 'Selected motherboard no longer matches the CPU socket',
      }),
    ])
  })

  test('throws when challenge() targets an unknown field', () => {
    const ump = umpire<TestFields>({
      fields: {
        email: {},
        password: {},
        submit: {},
        dates: {},
        startTime: {},
        endTime: {},
        everyHour: {},
        repeatEvery: {},
      },
      rules: [],
    })

    expect(() => ump.challenge('missing' as never, {})).toThrow(
      'Unknown field "missing"',
    )
  })
})
