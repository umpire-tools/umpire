import { evaluate, evaluateRuleForField } from '../src/evaluator.js'
import { buildGraph, topologicalSort } from '../src/graph.js'
import { anyOf, defineRule, enabledWhen, requires } from '../src/rules.js'
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
})
