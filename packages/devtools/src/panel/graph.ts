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

export const NODE_FONT_SIZE = 10
const NODE_CHAR_WIDTH = 9.15  // tweak if text overflows nodes
const NODE_PAD_X = 16  // 8px each side
const NODE_MIN_WIDTH = 50
const NODE_HEIGHT = 28
const COLUMN_GAP = 48
const ROW_GAP = 16
const PADDING_X = 24
const PADDING_Y = 20

function calcNodeWidth(fieldName: string): number {
  return Math.max(NODE_MIN_WIDTH, Math.ceil(fieldName.length * NODE_CHAR_WIDTH + NODE_PAD_X))
}

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
  positions: Map<string, { x: number; y: number; width: number }>,
) {
  const from = positions.get(edge.from)
  const to = positions.get(edge.to)

  if (!from || !to) {
    return null
  }

  const startX = from.x + from.width
  const startY = from.y + NODE_HEIGHT / 2
  const endX = to.x
  const endY = to.y + NODE_HEIGHT / 2
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

  // Max node width per column — all nodes in a column share the same x extent
  // so edges from any node in that column start at the same x.
  const columnWidths = new Map<number, number>()
  for (const [rank, fields] of columns.entries()) {
    columnWidths.set(rank, Math.max(...fields.map(calcNodeWidth)))
  }

  // Cumulative x position for each column.
  const columnX = new Map<number, number>()
  const sortedRanks = [...columns.keys()].sort((a, b) => a - b)
  let cursorX = PADDING_X
  for (const rank of sortedRanks) {
    columnX.set(rank, cursorX)
    cursorX += (columnWidths.get(rank) ?? NODE_MIN_WIDTH) + COLUMN_GAP
  }

  const positions = new Map<string, { x: number; y: number; width: number }>()
  const nodes = sortedRanks.flatMap((rank) =>
    (columns.get(rank) ?? []).map((field, row) => {
      const x = columnX.get(rank) ?? PADDING_X
      const y = PADDING_Y + row * (NODE_HEIGHT + ROW_GAP)
      const width = calcNodeWidth(field)

      positions.set(field, { x, y, width })

      return {
        color: getFieldTone(scorecard.fields[field]),
        field,
        height: NODE_HEIGHT,
        width,
        x,
        y,
      }
    })
  )

  const edges = scorecard.graph.edges
    .map((edge) => buildEdgePath(edge, positions))
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null)

  const lastRank = sortedRanks.at(-1) ?? 0
  const lastColumnX = columnX.get(lastRank) ?? PADDING_X
  const lastColumnWidth = columnWidths.get(lastRank) ?? NODE_MIN_WIDTH
  const tallestColumn = Math.max(...[...columns.values()].map((col) => col.length), 1)

  return {
    edges,
    height: PADDING_Y * 2 + tallestColumn * NODE_HEIGHT + (tallestColumn - 1) * ROW_GAP,
    nodes,
    width: lastColumnX + lastColumnWidth + PADDING_X,
  }
}
