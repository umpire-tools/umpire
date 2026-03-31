import { evaluate } from '../src/evaluator.js'
import { buildGraph, topologicalSort } from '../src/graph.js'
import { enabledWhen, requires } from '../src/rules.js'
import type { Rule } from '../src/types.js'

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
      enabledWhen<TestFields, TestConditions>('beta', (values) => values.alpha === 'on', {
        reason: 'alpha must be on',
      }),
    ]

    const topoOrder = createOrder(fields, rules)

    expect(evaluate(fields, rules, topoOrder, { alpha: 'on' }, {} as TestConditions).beta).toEqual({
      enabled: true,
      required: false,
      reason: null,
      reasons: [],
    })
    expect(
      evaluate(fields, rules, topoOrder, { alpha: 'off' }, {} as TestConditions).beta,
    ).toEqual({
      enabled: false,
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
      alpha: { enabled: true, required: true, reason: null, reasons: [] },
      beta: { enabled: true, required: false, reason: null, reasons: [] },
      gamma: { enabled: true, required: false, reason: null, reasons: [] },
      delta: { enabled: true, required: true, reason: null, reasons: [] },
    })
  })
})
