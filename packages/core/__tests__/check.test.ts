import { evaluate, evaluateRuleForField } from '../src/evaluator.js'
import { buildGraph, topologicalSort } from '../src/graph.js'
import {
  anyOf,
  defineRule,
  eitherOf,
  enabledWhen,
  fairWhen,
  requires,
} from '../src/rules.js'
import type { AvailabilityMap, Rule } from '../src/types.js'

type TestFields = {
  alpha: { required?: boolean }
  beta: { required?: boolean }
  gamma: { required?: boolean }
  delta: { required?: boolean }
}

type TestConditions = {
  allow?: boolean
  plan?: 'basic' | 'pro'
}

function createOrder(
  fields: TestFields,
  rules: Rule<TestFields, TestConditions>[],
) {
  const graph = buildGraph(fields, rules)
  return topologicalSort(graph, Object.keys(fields))
}

describe('evaluate', () => {
  test('enables and disables fields with enabledWhen predicates', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rules = [
      enabledWhen<TestFields, TestConditions>(
        'beta',
        (values) => values.alpha === 'on',
        {
          reason: 'alpha must be on',
        },
      ),
    ]

    const topoOrder = createOrder(fields, rules)

    expect(
      evaluate(fields, rules, topoOrder, { alpha: 'on' }, {} as TestConditions)
        .beta,
    ).toEqual({
      enabled: true,
      satisfied: false,
      fair: true,
      required: false,
      reason: null,
      reasons: [],
    })
    expect(
      evaluate(fields, rules, topoOrder, { alpha: 'off' }, {} as TestConditions)
        .beta,
    ).toEqual({
      enabled: false,
      satisfied: false,
      fair: true,
      required: false,
      reason: 'alpha must be on',
      reasons: ['alpha must be on'],
    })
  })

  test('ANDs multiple rules and keeps the first failing reason', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: { required: true },
      delta: {},
    }
    const rules = [
      enabledWhen<TestFields, TestConditions>('gamma', () => false, {
        reason: 'feature gate closed',
      }),
      requires<TestFields, TestConditions>('gamma', 'beta', {
        reason: 'beta is required',
      }),
    ]

    const topoOrder = createOrder(fields, rules)
    const result = evaluate(fields, rules, topoOrder, {}, {} as TestConditions)

    expect(result.gamma).toEqual({
      enabled: false,
      satisfied: false,
      fair: true,
      required: false,
      reason: 'feature gate closed',
      reasons: ['feature gate closed', 'beta is required'],
    })
  })

  test('suppresses required when the field is disabled', () => {
    const fields: TestFields = {
      alpha: {},
      beta: { required: true },
      gamma: {},
      delta: {},
    }
    const rules = [
      enabledWhen<TestFields, TestConditions>('beta', () => false, {
        reason: 'beta hidden',
      }),
    ]

    const topoOrder = createOrder(fields, rules)
    const result = evaluate(fields, rules, topoOrder, {}, {} as TestConditions)

    expect(result.beta.required).toBe(false)
    expect(result.beta.enabled).toBe(false)
  })

  test('passes conditions to predicates', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rules = [
      enabledWhen<TestFields, TestConditions>(
        'delta',
        (_values, conditions) => conditions.plan === 'pro',
        { reason: 'pro plan required' },
      ),
    ]

    const topoOrder = createOrder(fields, rules)

    expect(
      evaluate(fields, rules, topoOrder, {}, { plan: 'basic' }).delta,
    ).toMatchObject({
      enabled: false,
      reason: 'pro plan required',
    })
    expect(
      evaluate(fields, rules, topoOrder, {}, { plan: 'pro' }).delta,
    ).toMatchObject({
      enabled: true,
      reason: null,
    })
  })

  test('supports predicate-based requires dependencies when the predicate passes', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rules = [
      requires<TestFields, TestConditions>(
        'gamma',
        (_values, conditions) => conditions.allow === true,
        { reason: 'allow must be true' },
      ),
    ]

    const topoOrder = createOrder(fields, rules)

    expect(
      evaluate(fields, rules, topoOrder, {}, { allow: true }).gamma,
    ).toEqual({
      enabled: true,
      satisfied: false,
      fair: true,
      required: false,
      reason: null,
      reasons: [],
    })
    expect(
      evaluate(fields, rules, topoOrder, {}, { allow: false }).gamma,
    ).toEqual({
      enabled: false,
      satisfied: false,
      fair: true,
      required: false,
      reason: 'allow must be true',
      reasons: ['allow must be true'],
    })
  })

  test('treats fair custom rules as fairness checks instead of gate rules', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rules = [
      defineRule<TestFields, TestConditions>({
        type: 'socketFair',
        targets: ['beta'],
        sources: ['alpha'],
        constraint: 'fair',
        evaluate(values) {
          const matches = values.alpha === values.beta

          return new Map([
            [
              'beta',
              {
                enabled: true,
                fair: matches,
                reason: matches ? null : 'socket mismatch',
              },
            ],
          ])
        },
      }),
    ]
    const topoOrder = createOrder(fields, rules)

    expect(
      evaluate(
        fields,
        rules,
        topoOrder,
        { alpha: 'am5', beta: 'am5' },
        {} as TestConditions,
      ).beta,
    ).toEqual({
      enabled: true,
      satisfied: true,
      fair: true,
      required: false,
      reason: null,
      reasons: [],
    })
    expect(
      evaluate(
        fields,
        rules,
        topoOrder,
        { alpha: 'am5', beta: 'lga1700' },
        {} as TestConditions,
      ).beta,
    ).toEqual({
      enabled: true,
      satisfied: true,
      fair: false,
      required: false,
      reason: 'socket mismatch',
      reasons: ['socket mismatch'],
    })
  })

  test('preserves an empty reasons list when anyOf gate rules fail silently', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const silentRule: Rule<TestFields, TestConditions> = {
      type: 'silent',
      targets: ['beta'],
      sources: [],
      evaluate: () =>
        new Map([
          [
            'beta',
            {
              enabled: false,
              reason: null,
            },
          ],
        ]),
    }
    const rules = [anyOf(silentRule, silentRule)]
    const topoOrder = createOrder(fields, rules)

    expect(
      evaluate(fields, rules, topoOrder, {}, {} as TestConditions).beta,
    ).toEqual({
      enabled: false,
      satisfied: false,
      fair: true,
      required: false,
      reason: null,
      reasons: [],
    })
  })

  test('returns no reasons when silent fair anyOf rules fail', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const silentFairRule = {
      type: 'silent-fair',
      targets: ['delta'],
      sources: [],
      evaluate: () =>
        new Map([
          [
            'delta',
            {
              enabled: true,
              fair: false,
              reason: null,
            },
          ],
        ]),
      _umpire: {
        kind: 'fairWhen' as const,
        predicate: (() => false) as never,
      },
    } as Rule<TestFields, TestConditions> & {
      _umpire: {
        kind: 'fairWhen'
        predicate: never
        options?: undefined
      }
    }
    const rule = anyOf(silentFairRule, silentFairRule)

    expect(
      evaluateRuleForField(
        rule,
        'delta',
        fields,
        {},
        {} as TestConditions,
        undefined,
        {},
        new Map(),
      ),
    ).toEqual({
      enabled: true,
      fair: false,
      reason: null,
      reasons: undefined,
    })
  })

  test('evaluates every anyOf inner rule before OR-combining results', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    let firstCalls = 0
    let secondCalls = 0
    const firstRule: Rule<TestFields, TestConditions> = {
      type: 'first',
      targets: ['beta'],
      sources: [],
      evaluate: () => {
        firstCalls += 1
        return new Map([['beta', { enabled: true, reason: null }]])
      },
    }
    const secondRule: Rule<TestFields, TestConditions> = {
      type: 'second',
      targets: ['beta'],
      sources: [],
      evaluate: () => {
        secondCalls += 1
        return new Map([['beta', { enabled: false, reason: 'second failed' }]])
      },
    }
    const rule = anyOf(firstRule, secondRule)

    expect(
      evaluateRuleForField(
        rule,
        'beta',
        fields,
        {},
        {} as TestConditions,
        undefined,
        {},
        new Map(),
      ),
    ).toEqual({
      enabled: true,
      reason: null,
      reasons: undefined,
    })
    expect(firstCalls).toBe(1)
    expect(secondCalls).toBe(1)
  })

  test('keeps fair rules out of the gate phase when a field is already disabled', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rules = [
      enabledWhen<TestFields, TestConditions>('gamma', () => false, {
        reason: 'gate closed',
      }),
      defineRule<TestFields, TestConditions>({
        type: 'socketFair',
        targets: ['gamma'],
        sources: ['alpha'],
        constraint: 'fair',
        evaluate: () =>
          new Map([
            [
              'gamma',
              {
                enabled: false,
                fair: false,
                reason: 'fairness-only failure',
              },
            ],
          ]),
      }),
    ]
    const topoOrder = createOrder(fields, rules)

    expect(
      evaluate(fields, rules, topoOrder, {}, {} as TestConditions).gamma,
    ).toEqual({
      enabled: false,
      satisfied: false,
      fair: true,
      required: false,
      reason: 'gate closed',
      reasons: ['gate closed'],
    })
  })

  test('defaults to an enabled result when a targeted rule omits a field evaluation', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const availability: Partial<AvailabilityMap<TestFields>> = {}
    const rule: Rule<TestFields, TestConditions> = {
      type: 'partial',
      targets: ['delta'],
      sources: [],
      evaluate: () => new Map(),
    }

    expect(
      evaluateRuleForField(
        rule,
        'delta',
        fields,
        {},
        {} as TestConditions,
        undefined,
        availability,
        new Map(),
      ),
    ).toEqual({
      enabled: true,
      reason: null,
    })
  })

  test('treats missing dependency availability as enabled and fair in direct requires evaluation', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rule = requires<TestFields, TestConditions>('gamma', 'beta')

    expect(
      evaluateRuleForField(
        rule,
        'gamma',
        fields,
        { beta: 'set' },
        {} as TestConditions,
        undefined,
        {},
        new Map(),
      ),
    ).toEqual({
      enabled: true,
      reason: null,
      reasons: undefined,
    })
  })

  test('normalizes empty reasons arrays returned by direct rule evaluations', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rule: Rule<TestFields, TestConditions> = {
      type: 'empty-reasons',
      targets: ['alpha'],
      sources: [],
      evaluate: () =>
        new Map([
          [
            'alpha',
            {
              enabled: false,
              reason: 'empty reasons',
              reasons: [],
            },
          ],
        ]),
    }

    expect(
      evaluateRuleForField(
        rule,
        'alpha',
        fields,
        {},
        {} as TestConditions,
        undefined,
        {},
        new Map(),
      ),
    ).toEqual({
      enabled: false,
      fair: undefined,
      reason: 'empty reasons',
      reasons: undefined,
    })
  })

  test('includes every field even when there are no rules', () => {
    const fields: TestFields = {
      alpha: { required: true },
      beta: {},
      gamma: {},
      delta: { required: true },
    }
    const rules: Rule<TestFields, TestConditions>[] = []

    const graph = buildGraph(fields, rules)
    const topoOrder = topologicalSort(graph, Object.keys(fields))
    const result = evaluate(fields, rules, topoOrder, {}, {} as TestConditions)

    expect(result).toEqual({
      alpha: {
        enabled: true,
        satisfied: false,
        fair: true,
        required: true,
        reason: null,
        reasons: [],
      },
      beta: {
        enabled: true,
        satisfied: false,
        fair: true,
        required: false,
        reason: null,
        reasons: [],
      },
      gamma: {
        enabled: true,
        satisfied: false,
        fair: true,
        required: false,
        reason: null,
        reasons: [],
      },
      delta: {
        enabled: true,
        satisfied: false,
        fair: true,
        required: true,
        reason: null,
        reasons: [],
      },
    })
  })

  test('evaluates eitherOf by ORing branch-level AND results', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const passingRule = eitherOf<TestFields, TestConditions>('auth', {
      primary: [enabledWhen('beta', () => false, { reason: 'primary failed' })],
      fallback: [enabledWhen('beta', () => true)],
    })
    const failingRule = eitherOf<TestFields, TestConditions>('auth', {
      primary: [enabledWhen('beta', () => false, { reason: 'primary failed' })],
      fallback: [
        enabledWhen('beta', () => false, { reason: 'fallback failed' }),
      ],
    })

    expect(
      evaluateRuleForField(
        passingRule,
        'beta',
        fields,
        {},
        {} as TestConditions,
        undefined,
        {},
        new Map(),
      ),
    ).toEqual({
      enabled: true,
      reason: null,
      reasons: undefined,
    })

    expect(
      evaluateRuleForField(
        failingRule,
        'beta',
        fields,
        {},
        {} as TestConditions,
        undefined,
        {},
        new Map(),
      ),
    ).toEqual({
      enabled: false,
      reason: 'primary failed',
      reasons: ['primary failed', 'fallback failed'],
    })
  })

  test('ANDs rules within a branch — partial branch pass is not enough', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    // primary branch requires both alpha AND gamma to be present
    // secondary branch always fails
    // with only alpha present, primary partially passes — should still fail overall
    const rule = eitherOf<TestFields, TestConditions>('auth', {
      primary: [
        enabledWhen('beta', (v) => v.alpha !== undefined, {
          reason: 'needs alpha',
        }),
        enabledWhen('beta', (v) => v.gamma !== undefined, {
          reason: 'needs gamma',
        }),
      ],
      secondary: [
        enabledWhen('beta', () => false, { reason: 'secondary failed' }),
      ],
    })

    expect(
      evaluateRuleForField(
        rule,
        'beta',
        fields,
        { alpha: 'present' } as unknown as Record<keyof TestFields, unknown>,
        {} as TestConditions,
        undefined,
        {},
        new Map(),
      ),
    ).toEqual({
      enabled: false,
      reason: 'needs gamma',
      reasons: ['needs gamma', 'secondary failed'],
    })
  })

  test('keeps the first gate failure reason when later gate rules also fail', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rules = [
      enabledWhen<TestFields, TestConditions>('beta', () => false, {
        reason: 'first gate reason',
      }),
      enabledWhen<TestFields, TestConditions>('beta', () => false, {
        reason: 'second gate reason',
      }),
    ]
    const topoOrder = createOrder(fields, rules)

    expect(
      evaluate(fields, rules, topoOrder, {}, {} as TestConditions).beta,
    ).toEqual({
      enabled: false,
      satisfied: false,
      fair: true,
      required: false,
      reason: 'first gate reason',
      reasons: ['first gate reason', 'second gate reason'],
    })
  })

  test('keeps the first fair failure reason when multiple fair rules fail', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rules = [
      defineRule<TestFields, TestConditions>({
        type: 'custom-fair',
        targets: ['beta'],
        sources: [],
        constraint: 'fair',
        evaluate: () =>
          new Map([
            [
              'beta',
              { enabled: true, fair: false, reason: 'first fair reason' },
            ],
          ]),
      }),
      defineRule<TestFields, TestConditions>({
        type: 'custom-fair',
        targets: ['beta'],
        sources: [],
        constraint: 'fair',
        evaluate: () =>
          new Map([
            [
              'beta',
              { enabled: true, fair: false, reason: 'second fair reason' },
            ],
          ]),
      }),
    ]
    const topoOrder = createOrder(fields, rules)

    expect(
      evaluate(fields, rules, topoOrder, {}, {} as TestConditions).beta,
    ).toEqual({
      enabled: true,
      satisfied: false,
      fair: false,
      required: false,
      reason: 'first fair reason',
      reasons: ['first fair reason', 'second fair reason'],
    })
  })

  test('preserves non-empty reasons array from a base rule evaluation', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const ruleWithReasons: Rule<TestFields, TestConditions> = {
      type: 'custom',
      targets: ['beta'],
      sources: [],
      evaluate: () =>
        new Map([
          [
            'beta',
            {
              enabled: false,
              reason: 'main reason',
              reasons: ['detail one', 'detail two'],
            },
          ],
        ]),
    }

    expect(
      evaluateRuleForField(
        ruleWithReasons,
        'beta',
        fields,
        {},
        {} as TestConditions,
        undefined,
        {},
        new Map(),
      ),
    ).toEqual({
      enabled: false,
      reason: 'main reason',
      reasons: ['detail one', 'detail two'],
    })
  })

  test('omits reasons when the base rule returns an empty reasons array', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const ruleWithEmptyReasons: Rule<TestFields, TestConditions> = {
      type: 'custom',
      targets: ['beta'],
      sources: [],
      evaluate: () =>
        new Map([
          [
            'beta',
            {
              enabled: false,
              reason: 'main reason',
              reasons: [],
            },
          ],
        ]),
    }

    expect(
      evaluateRuleForField(
        ruleWithEmptyReasons,
        'beta',
        fields,
        {},
        {} as TestConditions,
        undefined,
        {},
        new Map(),
      ),
    ).toEqual({
      enabled: false,
      reason: 'main reason',
      reasons: undefined,
    })
  })
})
