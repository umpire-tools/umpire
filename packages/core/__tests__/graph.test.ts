import {
  check,
  defineRule,
  disables,
  eitherOf,
  enabledWhen,
  oneOf,
  requires,
} from '../src/rules.js'
import {
  buildGraph,
  detectCycles,
  exportGraph,
  topologicalSort,
} from '../src/graph.js'

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

    expect(() => detectCycles(graph)).toThrow(
      /Cycle detected: (alpha → beta → alpha|beta → alpha → beta)/,
    )
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

  test('detects the minimal cycle inside a longer chain', () => {
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
      requires<TestFields>('gamma', 'delta'),
      requires<TestFields>('delta', 'beta'),
    ])

    expect(() => detectCycles(graph)).toThrow(
      '[@umpire/core] Cycle detected: beta → delta → gamma → beta',
    )
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
      enabledWhen<TestFields>(
        'beta',
        check('alpha', (value) => value === 'ready'),
      ),
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

  test('buildGraph seeds bookkeeping for every unique field and keeps ordering edges separate', () => {
    const fields = {
      alpha: {},
      beta: {},
      gamma: {},
    }

    const graph = buildGraph(fields, [
      requires<typeof fields>('beta', 'alpha'),
      enabledWhen<typeof fields>(
        'beta',
        check('alpha', (value) => value === 'ready'),
      ),
      requires<typeof fields>('beta', 'alpha'),
    ])

    expect(graph.nodes).toEqual(['alpha', 'beta', 'gamma'])
    expect(graph.adjacency.get('alpha')).toEqual(['beta'])
    expect(graph.adjacency.get('beta')).toEqual([])
    expect(graph.adjacency.get('gamma')).toEqual([])
    expect(graph.incomingCounts.get('alpha')).toBe(0)
    expect(graph.incomingCounts.get('beta')).toBe(1)
    expect(graph.incomingCounts.get('gamma')).toBe(0)
    expect(graph.edges).toEqual([
      { from: 'alpha', to: 'beta', type: 'requires', ordering: true },
      { from: 'alpha', to: 'beta', type: 'enabledWhen', ordering: false },
    ])
  })

  test('treats fair custom rule sources as informational edges', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }
    const graph = buildGraph(fields, [
      defineRule<TestFields>({
        type: 'socketFair',
        targets: ['beta'],
        sources: ['alpha'],
        constraint: 'fair',
        evaluate(values) {
          return new Map([
            [
              'beta',
              {
                enabled: true,
                fair: values.alpha === values.beta,
                reason: values.alpha === values.beta ? null : 'socket mismatch',
              },
            ],
          ])
        },
      }),
      requires<TestFields>('alpha', 'beta'),
    ])

    expect(exportGraph(graph)).toEqual({
      nodes: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'],
      edges: [
        { from: 'alpha', to: 'beta', type: 'socketFair' },
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

  test('initializes graph bookkeeping for unseen edge endpoints', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }

    const graph = buildGraph(fields, [
      defineRule<TestFields>({
        type: 'externalSource',
        targets: ['alpha'],
        sources: ['zeta' as keyof TestFields & string],
        evaluate: () => new Map([['alpha', { enabled: true, reason: null }]]),
      }),
      defineRule<TestFields>({
        type: 'externalTarget',
        targets: ['omega' as keyof TestFields & string],
        sources: ['beta'],
        evaluate: () => new Map([['omega', { enabled: true, reason: null }]]),
      }),
    ])

    expect(graph.adjacency.get('zeta')).toEqual(['alpha'])
    expect(graph.adjacency.get('omega')).toEqual([])
    expect(graph.incomingCounts.get('zeta')).toBe(0)
    expect(graph.incomingCounts.get('omega')).toBe(1)
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'zeta', to: 'alpha', type: 'externalSource', ordering: true },
        { from: 'beta', to: 'omega', type: 'externalTarget', ordering: true },
      ]),
    )
  })

  test('unions eitherOf branch sources into ordering and informational edges', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }
    const graph = buildGraph(fields, [
      eitherOf<TestFields>('betaPaths', {
        dependency: [requires('beta', 'alpha')],
        conditional: [
          enabledWhen(
            'beta',
            check('gamma', (value) => value === 'ready'),
          ),
        ],
      }),
    ])

    expect(graph.edges).toEqual([
      { from: 'alpha', to: 'beta', type: 'eitherOf', ordering: true },
      { from: 'gamma', to: 'beta', type: 'eitherOf', ordering: false },
    ])
    expect(exportGraph(graph)).toEqual({
      nodes: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'],
      edges: [
        { from: 'alpha', to: 'beta', type: 'eitherOf' },
        { from: 'gamma', to: 'beta', type: 'eitherOf' },
      ],
    })

    const order = topologicalSort(graph, Object.keys(fields))
    expect(order.indexOf('alpha')).toBeLessThan(order.indexOf('beta'))
  })

  test('deduplicates duplicate edges and skips self-references', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }
    const graph = buildGraph(fields, [
      requires<TestFields>('beta', 'alpha'),
      requires<TestFields>('beta', 'alpha'),
      requires<TestFields>('alpha', 'alpha'),
      enabledWhen<TestFields>(
        'beta',
        check('alpha', (value) => value === 'ready'),
      ),
      enabledWhen<TestFields>(
        'beta',
        check('alpha', (value) => value === 'ready'),
      ),
      enabledWhen<TestFields>(
        'alpha',
        check('alpha', (value) => value === 'ready'),
      ),
    ])

    expect(graph.edges).toEqual([
      { from: 'alpha', to: 'beta', type: 'requires', ordering: true },
      { from: 'alpha', to: 'beta', type: 'enabledWhen', ordering: false },
    ])
  })

  test('buildGraph handles rules without internal metadata', () => {
    const fields: TestFields = {
      alpha: {},
      beta: {},
      gamma: {},
      delta: {},
      epsilon: {},
    }
    const opaqueRule = {
      type: 'opaque',
      targets: ['beta'],
      sources: ['alpha'],
      evaluate: () => new Map([['beta', { enabled: true, reason: null }]]),
    }

    expect(() => buildGraph(fields, [opaqueRule as never])).not.toThrow()
    expect(exportGraph(buildGraph(fields, [opaqueRule as never]))).toEqual({
      nodes: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'],
      edges: [{ from: 'alpha', to: 'beta', type: 'opaque' }],
    })
  })

  test('detectCycles ignores converging paths that revisit an inactive node', () => {
    const graph = {
      nodes: ['alpha', 'beta', 'gamma', 'delta'],
      edges: [],
      adjacency: new Map<string, string[]>([
        ['alpha', ['beta', 'gamma']],
        ['beta', ['delta']],
        ['gamma', ['delta']],
        ['delta', []],
      ]),
      incomingCounts: new Map<string, number>([
        ['alpha', 0],
        ['beta', 1],
        ['gamma', 1],
        ['delta', 2],
      ]),
      deferredEdgeGroups: [],
    }

    expect(() => detectCycles(graph)).not.toThrow()
  })

  test('detectCycles reports only the cycle segment, not the leading path', () => {
    const graph = {
      nodes: ['root', 'alpha', 'beta', 'gamma'],
      edges: [],
      adjacency: new Map<string, string[]>([
        ['root', ['alpha']],
        ['alpha', ['beta']],
        ['beta', ['gamma']],
        ['gamma', ['beta']],
      ]),
      incomingCounts: new Map<string, number>([
        ['root', 0],
        ['alpha', 1],
        ['beta', 2],
        ['gamma', 1],
      ]),
      deferredEdgeGroups: [],
    }

    expect(() => detectCycles(graph)).toThrow(
      '[@umpire/core] Cycle detected: beta → gamma → beta',
    )
  })

  test('detectCycles keeps searching sibling paths after a non-cyclic branch', () => {
    const graph = {
      nodes: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'],
      edges: [],
      adjacency: new Map<string, string[]>([
        ['alpha', ['beta', 'gamma']],
        ['beta', []],
        ['gamma', ['delta']],
        ['delta', ['gamma']],
        ['epsilon', []],
      ]),
      incomingCounts: new Map<string, number>([
        ['alpha', 0],
        ['beta', 1],
        ['gamma', 2],
        ['delta', 1],
        ['epsilon', 0],
      ]),
      deferredEdgeGroups: [],
    }

    expect(() => detectCycles(graph)).toThrow(
      '[@umpire/core] Cycle detected: gamma → delta → gamma',
    )
  })

  test('topologicalSort does not invent edges for sparse adjacency entries', () => {
    expect(() =>
      topologicalSort(
        {
          nodes: ['alpha', 'beta', 'Stryker was here'],
          edges: [],
          adjacency: new Map([['alpha', ['beta']]]),
          incomingCounts: new Map([
            ['alpha', 0],
            ['beta', 1],
            ['Stryker was here', 1],
          ]),
          deferredEdgeGroups: [],
        },
        ['alpha', 'beta', 'Stryker was here'],
      ),
    ).toThrow('Unable to produce topological order')
  })

  test('topologicalSort throws a fallback error for malformed acyclic graphs', () => {
    expect(() =>
      topologicalSort(
        {
          nodes: ['alpha', 'beta'],
          edges: [],
          adjacency: new Map([
            ['alpha', []],
            ['beta', []],
          ]),
          incomingCounts: new Map([
            ['alpha', 0],
            ['beta', 1],
          ]),
          deferredEdgeGroups: [],
        },
        ['alpha', 'beta'],
      ),
    ).toThrow('Unable to produce topological order')
  })

  test('detectCycles and topologicalSort tolerate sparse adjacency maps', () => {
    const graph = {
      nodes: ['alpha', 'beta'],
      edges: [],
      adjacency: new Map<string, string[]>([['alpha', ['beta']]]),
      incomingCounts: new Map<string, number>([
        ['alpha', 0],
        ['beta', 1],
      ]),
      deferredEdgeGroups: [],
    }

    expect(() => detectCycles(graph)).not.toThrow()
    expect(topologicalSort(graph, ['alpha', 'beta'])).toEqual(['alpha', 'beta'])
  })

  test('exportGraph deduplicates repeated raw edges', () => {
    expect(
      exportGraph({
        nodes: ['alpha', 'beta'],
        edges: [
          { from: 'alpha', to: 'beta', type: 'requires', ordering: true },
          { from: 'alpha', to: 'beta', type: 'requires', ordering: false },
        ],
        adjacency: new Map(),
        incomingCounts: new Map(),
        deferredEdgeGroups: [],
      }),
    ).toEqual({
      nodes: ['alpha', 'beta'],
      edges: [{ from: 'alpha', to: 'beta', type: 'requires' }],
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
        throw new Error(
          `graph.edges should not be accessed during ordering work (${String(prop)})`,
        )
      },
    })

    expect(() => detectCycles(graph)).not.toThrow()

    const order = topologicalSort(graph, Object.keys(fields))
    expect(order.indexOf('alpha')).toBeLessThan(order.indexOf('beta'))
    expect(order.indexOf('beta')).toBeLessThan(order.indexOf('gamma'))
    expect(order.indexOf('alpha')).toBeLessThan(order.indexOf('delta'))
  })
})
