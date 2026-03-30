import { evaluate } from '../src/evaluator.js'
import { buildGraph, topologicalSort } from '../src/graph.js'
import { disables, requires } from '../src/rules.js'
import type { Rule } from '../src/types.js'

type TestFields = {
  alpha: {}
  beta: {}
  gamma: {}
  delta: {}
}

function evaluateRules(
  fields: TestFields,
  rules: Rule<TestFields, Record<string, unknown>>[],
  values: Record<string, unknown>,
) {
  const graph = buildGraph(fields, rules)
  const topoOrder = topologicalSort(graph, Object.keys(fields))

  return evaluate(fields, rules, topoOrder, values, {})
}

describe('transitive availability', () => {
  test('requires fails when its dependency is disabled even if the value is satisfied', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rules: Rule<TestFields, Record<string, unknown>>[] = [
      disables<TestFields>('alpha', ['beta']),
      requires<TestFields>('gamma', 'beta'),
    ]

    const result = evaluateRules(fields, rules, {
      alpha: 'present',
      beta: 'stale value',
    })

    expect(result.beta).toMatchObject({
      enabled: false,
      reason: 'overridden by alpha',
    })
    expect(result.gamma).toMatchObject({
      enabled: false,
      reason: 'requires beta',
      reasons: ['requires beta'],
    })
  })

  test('propagates through deep requires chains', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rules: Rule<TestFields, Record<string, unknown>>[] = [
      disables<TestFields>('alpha', ['beta']),
      requires<TestFields>('gamma', 'beta'),
      requires<TestFields>('delta', 'gamma'),
    ]

    const result = evaluateRules(fields, rules, {
      alpha: 'present',
      beta: 'stale beta',
      gamma: 'stale gamma',
    })

    expect(result.gamma.reason).toBe('requires beta')
    expect(result.delta).toMatchObject({
      enabled: false,
      reason: 'requires gamma',
      reasons: ['requires gamma'],
    })
  })

  test('disables only checks source value, not source availability', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
    }
    const rules: Rule<TestFields, Record<string, unknown>>[] = [
      disables<TestFields>('alpha', ['beta']),
      disables<TestFields>('beta', ['gamma']),
    ]

    const result = evaluateRules(fields, rules, {
      alpha: 'present',
      beta: 'stale value',
    })

    expect(result.beta.enabled).toBe(false)
    expect(result.gamma).toMatchObject({
      enabled: false,
      reason: 'overridden by beta',
    })
  })
})
