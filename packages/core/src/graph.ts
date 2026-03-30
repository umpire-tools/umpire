import { getInternalRuleMetadata } from './rules.js'
import type { FieldDef, Rule } from './types.js'

export type GraphEdge = {
  from: string
  to: string
  type: string
}

export type DependencyGraph = {
  nodes: string[]
  edges: GraphEdge[]
  adjacency: Map<string, string[]>
  incomingCounts: Map<string, number>
}

function uniqueNodes(fieldNames: string[]): string[] {
  return [...new Set(fieldNames)]
}

function isOrderingEdge(edge: GraphEdge): boolean {
  return edge.type !== 'oneOf'
}

export function buildGraph<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(fields: F, rules: Rule<F, C>[]): DependencyGraph {
  const nodes = uniqueNodes(Object.keys(fields))
  const adjacency = new Map<string, string[]>()
  const incomingCounts = new Map<string, number>()
  const edges: GraphEdge[] = []
  const seenEdges = new Set<string>()

  for (const node of nodes) {
    adjacency.set(node, [])
    incomingCounts.set(node, 0)
  }

  for (const rule of rules) {
    const metadata = getInternalRuleMetadata(rule)

    if (metadata?.kind === 'oneOf') {
      const branchNames = Object.keys(metadata.branches)

      for (let sourceIndex = 0; sourceIndex < branchNames.length; sourceIndex += 1) {
        const sourceBranch = metadata.branches[branchNames[sourceIndex]]

        for (let targetIndex = 0; targetIndex < branchNames.length; targetIndex += 1) {
          if (sourceIndex === targetIndex) {
            continue
          }

          const targetBranch = metadata.branches[branchNames[targetIndex]]

          for (const source of sourceBranch) {
            for (const target of targetBranch) {
              const edgeKey = `${source}:${target}:${rule.type}`
              if (seenEdges.has(edgeKey)) {
                continue
              }
              seenEdges.add(edgeKey)

              edges.push({ from: source, to: target, type: rule.type })
            }
          }
        }
      }

      continue
    }

    for (const source of rule.sources) {
      for (const target of rule.targets) {
        if (source === target) {
          continue
        }

        const edgeKey = `${source}:${target}:${rule.type}`
        if (seenEdges.has(edgeKey)) {
          continue
        }
        seenEdges.add(edgeKey)

        edges.push({ from: source, to: target, type: rule.type })

        if (!adjacency.has(source)) {
          adjacency.set(source, [])
        }
        if (!adjacency.has(target)) {
          adjacency.set(target, [])
        }
        if (!incomingCounts.has(source)) {
          incomingCounts.set(source, 0)
        }
        if (!incomingCounts.has(target)) {
          incomingCounts.set(target, 0)
        }

        adjacency.get(source)?.push(target)
        incomingCounts.set(target, (incomingCounts.get(target) ?? 0) + 1)
      }
    }
  }

  return {
    nodes,
    edges,
    adjacency,
    incomingCounts,
  }
}

export function detectCycles(graph: DependencyGraph): void {
  const visited = new Set<string>()
  const active = new Set<string>()
  const stack: string[] = []

  const visit = (node: string): string[] | null => {
    visited.add(node)
    active.add(node)
    stack.push(node)

    for (const next of (graph.adjacency.get(node) ?? []).filter((candidate) =>
      graph.edges.some((edge) => edge.from === node && edge.to === candidate && isOrderingEdge(edge)),
    )) {
      if (!visited.has(next)) {
        const cycle = visit(next)
        if (cycle) {
          return cycle
        }
        continue
      }

      if (!active.has(next)) {
        continue
      }

      const cycleStart = stack.indexOf(next)
      return [...stack.slice(cycleStart), next]
    }

    stack.pop()
    active.delete(node)
    return null
  }

  for (const node of graph.nodes) {
    if (visited.has(node)) {
      continue
    }

    const cycle = visit(node)
    if (cycle) {
      throw new Error(`Cycle detected: ${cycle.join(' → ')}`)
    }
  }
}

export function topologicalSort(graph: DependencyGraph, fieldNames: string[]): string[] {
  const orderedFields = uniqueNodes(fieldNames)
  const incomingCounts = new Map<string, number>()
  const orderingAdjacency = new Map<string, string[]>()

  for (const field of orderedFields) {
    incomingCounts.set(field, 0)
    orderingAdjacency.set(field, [])
  }

  for (const edge of graph.edges) {
    if (!isOrderingEdge(edge)) {
      continue
    }

    orderingAdjacency.get(edge.from)?.push(edge.to)
    incomingCounts.set(edge.to, (incomingCounts.get(edge.to) ?? 0) + 1)
  }

  const queue = orderedFields.filter((field) => (incomingCounts.get(field) ?? 0) === 0)
  const result: string[] = []

  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index]
    result.push(node)

    for (const next of orderingAdjacency.get(node) ?? []) {
      const remaining = (incomingCounts.get(next) ?? 0) - 1
      incomingCounts.set(next, remaining)
      if (remaining === 0) {
        queue.push(next)
      }
    }
  }

  if (result.length !== orderedFields.length) {
    detectCycles(graph)
    throw new Error('Unable to produce topological order')
  }

  return result
}

export function exportGraph(graph: DependencyGraph): {
  nodes: string[]
  edges: Array<{ from: string; to: string; type: string }>
} {
  return {
    nodes: [...graph.nodes],
    edges: graph.edges.map((edge) => ({ ...edge })),
  }
}
