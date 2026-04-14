import { getGraphSourceInfo, getInternalRuleMetadata } from './rules.js'
import type { FieldDef, Rule } from './types.js'

export type GraphEdge = {
  from: string
  to: string
  type: string
  ordering: boolean
}

type DeferredGraphEdgeGroup = {
  type: string
  branches: string[][]
}

export type DependencyGraph = {
  nodes: string[]
  edges: GraphEdge[]
  adjacency: Map<string, string[]>
  incomingCounts: Map<string, number>
  deferredEdgeGroups: DeferredGraphEdgeGroup[]
}

function uniqueNodes(fieldNames: string[]): string[] {
  return [...new Set(fieldNames)]
}

export function buildGraph<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(fields: F, rules: Rule<F, C>[]): DependencyGraph {
  const nodes = uniqueNodes(Object.keys(fields))
  const adjacency = new Map<string, string[]>()
  const incomingCounts = new Map<string, number>()
  const edges: GraphEdge[] = []
  const deferredEdgeGroups: DeferredGraphEdgeGroup[] = []
  const seenEdges = new Set<string>()

  function addEdge(from: string, to: string, type: string, ordering: boolean): void {
    const edgeKey = `${from}:${to}:${type}:${ordering ? 'ordering' : 'informational'}`
    if (seenEdges.has(edgeKey)) {
      return
    }
    seenEdges.add(edgeKey)

    edges.push({ from, to, type, ordering })

    if (!ordering) {
      return
    }

    if (!adjacency.has(from)) {
      adjacency.set(from, [])
    }
    if (!adjacency.has(to)) {
      adjacency.set(to, [])
    }
    if (!incomingCounts.has(from)) {
      incomingCounts.set(from, 0)
    }
    if (!incomingCounts.has(to)) {
      incomingCounts.set(to, 0)
    }

    adjacency.get(from)?.push(to)
    incomingCounts.set(to, (incomingCounts.get(to) ?? 0) + 1)
  }

  for (const node of nodes) {
    adjacency.set(node, [])
    incomingCounts.set(node, 0)
  }

  for (const rule of rules) {
    const metadata = getInternalRuleMetadata(rule)

    if (metadata?.kind === 'oneOf') {
      deferredEdgeGroups.push({
        type: rule.type,
        branches: Object.keys(metadata.branches).map((branchName) => [...metadata.branches[branchName]]),
      })

      continue
    }

    const { ordering, informational } = getGraphSourceInfo(rule)

    for (const source of ordering) {
      for (const target of rule.targets) {
        if (source === target) {
          continue
        }

        addEdge(source, target, rule.type, true)
      }
    }

    for (const source of informational) {
      for (const target of rule.targets) {
        if (source === target) {
          continue
        }

        addEdge(source, target, rule.type, false)
      }
    }
  }

  return {
    nodes,
    edges,
    adjacency,
    incomingCounts,
    deferredEdgeGroups,
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

    for (const next of graph.adjacency.get(node) ?? []) {
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
      throw new Error(`[@umpire/core] Cycle detected: ${cycle.join(' → ')}`)
    }
  }
}

export function topologicalSort(graph: DependencyGraph, fieldNames: string[]): string[] {
  const orderedFields = uniqueNodes(fieldNames)
  const incomingCounts = new Map<string, number>()

  for (const field of orderedFields) {
    incomingCounts.set(field, graph.incomingCounts.get(field) ?? 0)
  }

  const queue = orderedFields.filter((field) => (incomingCounts.get(field) ?? 0) === 0)
  const result: string[] = []

  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index]
    result.push(node)

    for (const next of graph.adjacency.get(node) ?? []) {
      const remaining = (incomingCounts.get(next) ?? 0) - 1
      incomingCounts.set(next, remaining)
      if (remaining === 0) {
        queue.push(next)
      }
    }
  }

  if (result.length !== orderedFields.length) {
    detectCycles(graph)
    throw new Error('[@umpire/core] Unable to produce topological order')
  }

  return result
}

export function exportGraph(graph: DependencyGraph): {
  nodes: string[]
  edges: Array<{ from: string; to: string; type: string }>
} {
  const edges: Array<{ from: string; to: string; type: string }> = []
  const seenEdges = new Set<string>()

  function addExportEdge(from: string, to: string, type: string): void {
    const edgeKey = `${from}:${to}:${type}`
    if (seenEdges.has(edgeKey)) {
      return
    }

    seenEdges.add(edgeKey)
    edges.push({ from, to, type })
  }

  for (const edge of graph.edges) {
    addExportEdge(edge.from, edge.to, edge.type)
  }

  for (const group of graph.deferredEdgeGroups) {
    for (let sourceIndex = 0; sourceIndex < group.branches.length; sourceIndex += 1) {
      const sourceBranch = group.branches[sourceIndex]

      for (let targetIndex = 0; targetIndex < group.branches.length; targetIndex += 1) {
        if (sourceIndex === targetIndex) {
          continue
        }

        const targetBranch = group.branches[targetIndex]

        for (const source of sourceBranch) {
          for (const target of targetBranch) {
            addExportEdge(source, target, group.type)
          }
        }
      }
    }
  }

  return {
    nodes: [...graph.nodes],
    edges,
  }
}
