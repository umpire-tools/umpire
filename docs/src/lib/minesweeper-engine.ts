import { enabledWhen, umpire } from '@umpire/core'
import type { FieldDef, Umpire } from '@umpire/core'

export type CellMeta = {
  x: number
  y: number
  isMine: boolean
  adjacentMines: number
}

export type Board = Record<string, CellMeta>

export type CellValue = 'revealed' | 'flagged' | undefined

export type Values = Record<string, CellValue>

export type GameConditions = {
  gameStatus: 'idle' | 'playing' | 'won' | 'lost'
  flagMode: boolean
}

const OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
] as const

export function cellKey(x: number, y: number): string {
  return `c_${x}_${y}`
}

function parseCellKey(key: string): [number, number] {
  const parts = key.split('_')
  return [Number(parts[1]), Number(parts[2])]
}

export function createBoard(width: number, height: number): Board {
  const board: Board = {}

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      board[cellKey(x, y)] = { x, y, isMine: false, adjacentMines: 0 }
    }
  }

  return board
}

export function placeMines(
  board: Board,
  minePositions: Array<[number, number]>,
): Board {
  const next: Board = {}

  for (const [key, cell] of Object.entries(board)) {
    next[key] = { ...cell }
  }

  for (const [x, y] of minePositions) {
    const key = cellKey(x, y)

    if (next[key]) {
      next[key] = { ...next[key], isMine: true }
    }
  }

  return next
}

export function computeAdjacency(board: Board): Board {
  const next: Board = {}

  for (const [key, cell] of Object.entries(board)) {
    const count = OFFSETS.reduce((sum, [dx, dy]) => {
      const neighbor = board[cellKey(cell.x + dx, cell.y + dy)]
      return sum + (neighbor?.isMine ? 1 : 0)
    }, 0)

    next[key] = { ...cell, adjacentMines: count }
  }

  return next
}

export function cascadeReveal(
  board: Board,
  values: Values,
  x: number,
  y: number,
): Values {
  const next: Values = { ...values }
  const startKey = cellKey(x, y)
  const startCell = board[startKey]

  if (!startCell || startCell.isMine) {
    return next
  }

  next[startKey] = 'revealed'

  if (startCell.adjacentMines > 0) {
    return next
  }

  const queue: string[] = [startKey]
  const visited = new Set<string>([startKey])

  while (queue.length > 0) {
    const currentKey = queue.shift()!
    const [cx, cy] = parseCellKey(currentKey)

    for (const [dx, dy] of OFFSETS) {
      const neighborKey = cellKey(cx + dx, cy + dy)
      const neighbor = board[neighborKey]

      if (!neighbor || visited.has(neighborKey)) {
        continue
      }

      visited.add(neighborKey)

      if (neighbor.isMine) {
        continue
      }

      next[neighborKey] = 'revealed'

      if (neighbor.adjacentMines === 0) {
        queue.push(neighborKey)
      }
    }
  }

  return next
}

export function checkWin(board: Board, values: Values): boolean {
  for (const [key, cell] of Object.entries(board)) {
    if (!cell.isMine && values[key] !== 'revealed') {
      return false
    }
  }

  return true
}

export function createMinesweeperUmpire(board: Board): Umpire<Record<string, FieldDef>, GameConditions> {
  const keys = Object.keys(board)
  const fields: Record<string, FieldDef> = {}

  for (const key of keys) {
    fields[key] = { default: undefined }
  }

  const rules = keys.flatMap((key) => [
    enabledWhen(key, (_: unknown, conditions: GameConditions) => conditions.gameStatus === 'playing', {
      reason: 'GAME_OVER',
    }),
    enabledWhen(key, (values: Values) => values[key] !== 'revealed', {
      reason: 'ALREADY_REVEALED',
    }),
    enabledWhen(key, (values: Values, conditions: GameConditions) => {
      if (conditions.flagMode) {
        return true
      }

      return values[key] !== 'flagged'
    }, {
      reason: 'FLAGGED',
    }),
  ])

  return umpire({ fields, rules }) as Umpire<Record<string, FieldDef>, GameConditions>
}

export function buildBoard(
  width: number,
  height: number,
  minePositions: Array<[number, number]>,
): Board {
  return computeAdjacency(placeMines(createBoard(width, height), minePositions))
}
