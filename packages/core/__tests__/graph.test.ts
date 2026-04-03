import { check, disables, enabledWhen, oneOf, requires } from '../src/rules.js'
import { buildGraph, detectCycles, exportGraph, topologicalSort } from '../src/graph.js'

type TestFields = {
  alpha: {}
  beta: {}
  gamma: {}
  delta: {}
  epsilon: {}
}

describe('graph utilities', () => {
  test('detects a direct cycle', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }
    const graph = buildGraph(fields, [
      requires<TestFields>('alpha', 'beta'),
      requires<TestFields>('beta', 'alpha'),
    ])

    expect(() => detectCycles(graph)).toThrow(/Cycle detected: (alpha → beta → alpha|beta → alpha → beta)/)
  })

  test('detects a transitive cycle', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }
    const graph = buildGraph(fields, [
      requires<TestFields>('alpha', 'beta'),
      requires<TestFields>('beta', 'gamma'),
      requires<TestFields>('gamma', 'alpha'),
    ])

    expect(() => detectCycles(graph)).toThrow(
      /Cycle detected: (alpha → gamma → beta → alpha|beta → alpha → gamma → beta|gamma → beta → alpha → gamma)/,
    )
  })

  test('detects mixed-rule cycles', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }
    const graph = buildGraph(fields, [
      requires<TestFields>('alpha', 'beta'),
      requires<TestFields>('beta', 'gamma'),
      disables<TestFields>('alpha', ['gamma']),
    ])

    expect(() => detectCycles(graph)).toThrow('Cycle detected')
  })

  test('topological sort returns leaves first and keeps disconnected fields', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }
    const graph = buildGraph(fields, [
      requires<TestFields>('beta', 'alpha'),
      requires<TestFields>('gamma', 'beta'),
      disables<TestFields>('alpha', ['delta']),
    ])

    const order = topologicalSort(graph, Object.keys(fields))

    expect(order).toHaveLength(5)
    expect(order).toContain('epsilon')
    expect(order.indexOf('alpha')).toBeLessThan(order.indexOf('beta'))
    expect(order.indexOf('beta')).toBeLessThan(order.indexOf('gamma'))
    expect(order.indexOf('alpha')).toBeLessThan(order.indexOf('delta'))
  })

  test('exportGraph returns nodes and typed edges', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }
    const graph = buildGraph(fields, [
      requires<TestFields>('beta', 'alpha'),
      disables<TestFields>('alpha', ['gamma', 'delta']),
    ])

    expect(exportGraph(graph)).toEqual({
      nodes: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'],
      edges: [
        { from: 'alpha', to: 'beta', type: 'requires' },
        { from: 'alpha', to: 'gamma', type: 'disables' },
        { from: 'alpha', to: 'delta', type: 'disables' },
      ],
    })
  })

  test('exports enabledWhen check() dependencies without treating them as ordering edges', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }
    const graph = buildGraph(fields, [
      enabledWhen<TestFields>('beta', check('alpha', (value) => value === 'ready')),
      requires<TestFields>('alpha', 'beta'),
    ])

    expect(exportGraph(graph)).toEqual({
      nodes: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'],
      edges: [
        { from: 'alpha', to: 'beta', type: 'enabledWhen' },
        { from: 'beta', to: 'alpha', type: 'requires' },
      ],
    })

    expect(() => detectCycles(graph)).not.toThrow()

    const order = topologicalSort(graph, Object.keys(fields))
    expect(order.indexOf('beta')).toBeLessThan(order.indexOf('alpha'))
  })

  test('stores oneOf informational edges compactly until export', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }
    const graph = buildGraph(fields, [
      oneOf<TestFields>('strategy', {
        first: ['alpha', 'beta'],
        second: ['gamma'],
      }),
    ])

    expect(graph.edges).toEqual([])
    expect(exportGraph(graph)).toEqual({
      nodes: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'],
      edges: [
        { from: 'alpha', to: 'gamma', type: 'oneOf' },
        { from: 'beta', to: 'gamma', type: 'oneOf' },
        { from: 'gamma', to: 'alpha', type: 'oneOf' },
        { from: 'gamma', to: 'beta', type: 'oneOf' },
      ],
    })
  })

  test('reuses precomputed ordering structures without consulting exported edges', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }
    const graph = buildGraph(fields, [
      requires<TestFields>('beta', 'alpha'),
      requires<TestFields>('gamma', 'beta'),
      disables<TestFields>('alpha', ['delta']),
    ])

    graph.edges = new Proxy(graph.edges, {
      get(_target, prop) {
        throw new Error(`graph.edges should not be accessed during ordering work (${String(prop)})`)
      },
    })

    expect(() => detectCycles(graph)).not.toThrow()

    const order = topologicalSort(graph, Object.keys(fields))
    expect(order.indexOf('alpha')).toBeLessThan(order.indexOf('beta'))
    expect(order.indexOf('beta')).toBeLessThan(order.indexOf('gamma'))
    expect(order.indexOf('alpha')).toBeLessThan(order.indexOf('delta'))
  })
})
