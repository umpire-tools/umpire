import type {
  ScorecardResult,
  UmpireGraphEdge,
} from '@umpire/core'
import { getFieldTone, getRuleTone } from './theme.js'

export type GraphLayout = {
  edges: Array<{
    color: string
    from: {
      x: number
      y: number
    }
    id: string
    path: string
    to: {
      x: number
      y: number
    }
    type: string
  }>
  height: number
  nodes: Array<{
    color: string
    field: string
    height: number
    width: number
    x: number
    y: number
  }>
  width: number
}

const nodeWidth = 108
const nodeHeight = 34
const columnGap = 56
const rowGap = 18
const paddingX = 28
const paddingY = 24

function buildRanks(graph: ScorecardResult<Record<string, {}>, Record<string, unknown>>['graph']) {
  const incoming = new Map<string, number>(graph.nodes.map((node) => [node, 0]))
  const outgoing = new Map<string, string[]>(graph.nodes.map((node) => [node, []]))

  for (const edge of graph.edges) {
    outgoing.get(edge.from)?.push(edge.to)
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
  }

  const queue = graph.nodes.filter((node) => (incoming.get(node) ?? 0) === 0)
  const rankByNode = new Map<string, number>(graph.nodes.map((node) => [node, 0]))

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      break
    }

    const rank = rankByNode.get(current) ?? 0

    for (const next of outgoing.get(current) ?? []) {
      rankByNode.set(next, Math.max(rankByNode.get(next) ?? 0, rank + 1))
      incoming.set(next, (incoming.get(next) ?? 1) - 1)

      if ((incoming.get(next) ?? 0) === 0) {
        queue.push(next)
      }
    }
  }

  return rankByNode
}

function buildEdgePath(
  edge: UmpireGraphEdge,
  positions: Map<string, { x: number; y: number }>,
) {
  const from = positions.get(edge.from)
  const to = positions.get(edge.to)

  if (!from || !to) {
    return null
  }

  const startX = from.x + nodeWidth
  const startY = from.y + nodeHeight / 2
  const endX = to.x
  const endY = to.y + nodeHeight / 2
  const controlOffset = Math.max(20, (endX - startX) / 2)

  return {
    color: getRuleTone(edge.type),
    from: { x: startX, y: startY },
    id: `${edge.from}:${edge.to}:${edge.type}`,
    path: `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`,
    to: { x: endX, y: endY },
    type: edge.type,
  }
}

export function layoutGraph(
  scorecard: ScorecardResult<Record<string, {}>, Record<string, unknown>>,
): GraphLayout {
  const rankByNode = buildRanks(scorecard.graph)
  const columns = new Map<number, string[]>()

  for (const node of scorecard.graph.nodes) {
    const rank = rankByNode.get(node) ?? 0
    const column = columns.get(rank) ?? []
    column.push(node)
    columns.set(rank, column)
  }

  const positions = new Map<string, { x: number; y: number }>()
  const nodes = [...columns.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([rank, fields]) => fields.map((field, row) => {
      const x = paddingX + rank * (nodeWidth + columnGap)
      const y = paddingY + row * (nodeHeight + rowGap)

      positions.set(field, { x, y })

      return {
        color: getFieldTone(scorecard.fields[field]),
        field,
        height: nodeHeight,
        width: nodeWidth,
        x,
        y,
      }
    }))

  const edges = scorecard.graph.edges
    .map((edge) => buildEdgePath(edge, positions))
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null)

  const lastColumn = Math.max(...columns.keys(), 0)
  const tallestColumn = Math.max(...[...columns.values()].map((column) => column.length), 1)

  return {
    edges,
    height: paddingY * 2 + tallestColumn * nodeHeight + (tallestColumn - 1) * rowGap,
    nodes,
    width: paddingX * 2 + (lastColumn + 1) * nodeWidth + lastColumn * columnGap,
  }
}
