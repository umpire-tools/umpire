import type { Rule } from 'eslint'
import type * as estree from 'estree'
import { getRulesArray, isUmpireCall } from '../utils.js'

/**
 * Detects cycles in the requires dependency graph within a single umpire() call.
 *
 * requires(A, B) + requires(B, A) → A and B mutually require each other;
 * neither can ever be enabled.
 *
 * Handles cycles of any length (A→B→C→A, etc.) using DFS with gray/black
 * coloring. Reports on the requires() call whose dep edge closes the cycle.
 *
 * Only checks top-level string-literal requires arguments. Rules nested inside
 * anyOf/eitherOf have OR/branch semantics and are intentionally skipped.
 */
const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow circular requires dependencies between fields.',
      recommended: true,
    },
    messages: {
      circular:
        'Circular requires: {{cycle}}. These fields mutually require each other and can never all be enabled.',
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node: estree.CallExpression) {
        if (!isUmpireCall(node)) return

        const rulesArray = getRulesArray(node)
        if (!rulesArray) return

        const edges: RequiresEdge[] = []

        for (const el of rulesArray.elements) {
          if (
            !el ||
            el.type !== 'CallExpression' ||
            el.callee.type !== 'Identifier' ||
            el.callee.name !== 'requires'
          )
            continue

          const args = el.arguments.filter(
            (a): a is estree.Expression => a.type !== 'SpreadElement',
          )
          const targetArg = args[0]
          if (!targetArg || !isStringLit(targetArg)) continue
          const target = targetArg.value

          for (const depArg of args.slice(1)) {
            if (isStringLit(depArg)) {
              edges.push({ from: target, to: depArg.value, node: el })
            }
          }
        }

        for (const { cycle, closingNode } of findCycles(edges)) {
          context.report({
            node: closingNode as unknown as estree.Node,
            messageId: 'circular',
            data: { cycle: cycle.map((f) => `'${f}'`).join(' → ') },
          })
        }
      },
    }
  },
}

export default rule

// ---------------------------------------------------------------------------
// Graph types and cycle detection
// ---------------------------------------------------------------------------

type RequiresEdge = {
  from: string
  to: string
  node: estree.CallExpression
}

type CycleReport = {
  /** Full cycle path, e.g. ['a', 'b', 'c', 'a'] */
  cycle: string[]
  /** The requires() call whose dep edge closes the cycle */
  closingNode: estree.CallExpression
}

/**
 * Finds all unique directed cycles in the requires graph using DFS with
 * gray/black node coloring.
 *
 * - Gray: node is on the current DFS stack
 * - Black: node is fully explored (all descendants processed)
 *
 * A back edge to a gray node indicates a cycle. Reports once per unique cycle
 * (normalized by rotating to start at the lexicographically smallest field).
 */
function findCycles(edges: RequiresEdge[]): CycleReport[] {
  if (edges.length === 0) return []

  // Build adjacency list: from → outgoing edges
  const adj = new Map<string, RequiresEdge[]>()
  for (const e of edges) {
    const list = adj.get(e.from) ?? []
    list.push(e)
    adj.set(e.from, list)
  }

  const allNodes = new Set(edges.flatMap((e) => [e.from, e.to]))
  const state = new Map<string, 'white' | 'gray' | 'black'>()
  for (const n of allNodes) state.set(n, 'white')

  const results: CycleReport[] = []
  const reportedKeys = new Set<string>()
  const path: string[] = []

  function visit(node: string): void {
    state.set(node, 'gray')
    path.push(node)

    for (const edge of adj.get(node) ?? []) {
      const nextState = state.get(edge.to)

      if (nextState === 'gray') {
        // Back edge — found a cycle. Slice the path from where `edge.to`
        // first appears to get the participating nodes.
        const cycleStart = path.indexOf(edge.to)
        const cycle = path.slice(cycleStart)
        const key = normalizeCycle(cycle)
        if (!reportedKeys.has(key)) {
          reportedKeys.add(key)
          // `edge` is the closing edge; its requires() node is the report site.
          results.push({ cycle: [...cycle, edge.to], closingNode: edge.node })
        }
      } else if (nextState === 'white') {
        visit(edge.to)
      }
      // black: already fully explored, no new cycles reachable from here
    }

    path.pop()
    state.set(node, 'black')
  }

  for (const n of allNodes) {
    if (state.get(n) === 'white') visit(n)
  }

  return results
}

/**
 * Rotates the cycle array to start at the lexicographically smallest element
 * so that the same cycle detected from different entry points produces the
 * same key.
 */
function normalizeCycle(cycle: string[]): string {
  const min = [...cycle].sort()[0]
  const minIdx = cycle.indexOf(min)
  return [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)].join('→')
}

function isStringLit(
  node: estree.Node,
): node is estree.Literal & { value: string } {
  return node.type === 'Literal' && typeof node.value === 'string'
}
