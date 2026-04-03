import { useState } from 'react'
import { useUmpire } from '@umpire/react'
import {
  buildBoard,
  cascadeReveal,
  cellKey,
  checkWin,
  createBoard,
  createMinesweeperUmpire,
  type Board,
  type CellMeta,
  type GameConditions,
  type Values,
} from '../lib/minesweeper-engine.js'

const BOARD_WIDTH = 8
const BOARD_HEIGHT = 8
const MINE_COUNT = 10

const EMPTY_BOARD = createBoard(BOARD_WIDTH, BOARD_HEIGHT)
const CELL_ORDER = Object.values(EMPTY_BOARD)
const MINESWEEPER_UMP = createMinesweeperUmpire(EMPTY_BOARD)

const STATUS_FACE: Record<GameConditions['gameStatus'], string> = {
  idle: '•‿•',
  playing: '•‿•',
  lost: '•︵•',
  won: '•̀‿•́',
}

const STATUS_LABEL: Record<GameConditions['gameStatus'], string> = {
  idle: 'Ready',
  playing: 'Playing',
  lost: 'Lost',
  won: 'Won',
}

type CellInspector = {
  key: string
  x: number
  y: number
}

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function createPrng(seed: number) {
  let state = seed >>> 0

  return function nextRandom() {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickMinePositions(
  width: number,
  height: number,
  mineCount: number,
  safeCell: [number, number],
  seed: number,
): Array<[number, number]> {
  const positions: Array<[number, number]> = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === safeCell[0] && y === safeCell[1]) {
        continue
      }

      positions.push([x, y])
    }
  }

  const nextRandom = createPrng(seed)

  for (let index = positions.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(nextRandom() * (index + 1))
    const current = positions[index]
    positions[index] = positions[swapIndex]
    positions[swapIndex] = current
  }

  return positions.slice(0, mineCount)
}

function revealAllMines(board: Board, values: Values): Values {
  const next: Values = { ...values }

  for (const [key, cell] of Object.entries(board)) {
    if (cell.isMine) {
      next[key] = 'revealed'
    }
  }

  return next
}

function describeCellValue(value: Values[string]) {
  if (value === 'revealed') {
    return 'revealed'
  }

  if (value === 'flagged') {
    return 'flagged'
  }

  return 'hidden'
}

function numberClass(adjacentMines: number) {
  if (adjacentMines < 1 || adjacentMines > 8) {
    return null
  }

  return `minesweeper-demo__number--${adjacentMines}`
}

export default function MinesweeperDemo({ compact = false }: { compact?: boolean }) {
  const [board, setBoard] = useState<Board | null>(null)
  const [seed, setSeed] = useState(() => Date.now())
  const [values, setValues] = useState<Values>({})
  const [conditions, setConditions] = useState<GameConditions>({
    gameStatus: 'playing',
    flagMode: false,
  })
  const [inspectedCell, setInspectedCell] = useState<CellInspector>({
    key: cellKey(0, 0),
    x: 0,
    y: 0,
  })

  const { check: availability } = useUmpire(MINESWEEPER_UMP, values, conditions)
  const activeBoard = board ?? EMPTY_BOARD
  const flaggedCount = CELL_ORDER.reduce((count, cell) => {
    return count + (values[cellKey(cell.x, cell.y)] === 'flagged' ? 1 : 0)
  }, 0)
  const inspectedAvailability = availability[inspectedCell.key]
  const inspectedMeta = activeBoard[inspectedCell.key]
  const inspectedJson = prettyJson({
    [inspectedCell.key]: inspectedAvailability,
  })

  function inspect(cell: CellMeta) {
    setInspectedCell({
      key: cellKey(cell.x, cell.y),
      x: cell.x,
      y: cell.y,
    })
  }

  function resetGame() {
    setBoard(null)
    setSeed(Date.now())
    setValues({})
    setConditions({ gameStatus: 'playing', flagMode: false })
    setInspectedCell({
      key: cellKey(0, 0),
      x: 0,
      y: 0,
    })
  }

  function toggleFlag(cell: CellMeta) {
    inspect(cell)

    if (conditions.gameStatus !== 'playing') {
      return
    }

    const key = cellKey(cell.x, cell.y)

    if (values[key] === 'revealed') {
      return
    }

    setValues((current) => ({
      ...current,
      [key]: current[key] === 'flagged' ? undefined : 'flagged',
    }))
  }

  function revealCell(cell: CellMeta) {
    inspect(cell)

    if (conditions.gameStatus !== 'playing') {
      return
    }

    const key = cellKey(cell.x, cell.y)
    const cellAvailability = availability[key]

    if (!cellAvailability.enabled) {
      return
    }

    const nextBoard =
      board ??
      buildBoard(
        BOARD_WIDTH,
        BOARD_HEIGHT,
        pickMinePositions(BOARD_WIDTH, BOARD_HEIGHT, MINE_COUNT, [cell.x, cell.y], seed),
      )

    let nextValues: Values
    let nextStatus: GameConditions['gameStatus'] = 'playing'

    if (nextBoard[key].isMine) {
      nextStatus = 'lost'
      nextValues = revealAllMines(nextBoard, { ...values, [key]: 'revealed' })
    } else {
      nextValues = cascadeReveal(nextBoard, values, cell.x, cell.y)

      if (checkWin(nextBoard, nextValues)) {
        nextStatus = 'won'
        nextValues = revealAllMines(nextBoard, nextValues)
      }
    }

    setBoard(nextBoard)
    setValues(nextValues)
    setConditions((current) => ({
      ...current,
      gameStatus: nextStatus,
    }))
  }

  function handleCellClick(cell: CellMeta) {
    if (conditions.flagMode) {
      toggleFlag(cell)
      return
    }

    revealCell(cell)
  }

  return (
    <div
      className={cls(
        'minesweeper-demo',
        'umpire-demo',
        'umpire-demo--styled',
        compact && 'minesweeper-demo--compact',
      )}
    >
      <div className={cls('umpire-demo__layout', 'minesweeper-demo__layout')}>
        <section className={cls('umpire-demo__panel', 'minesweeper-demo__panel', 'minesweeper-demo__panel--board')}>
          <div className="umpire-demo__panel-header">
            <div>
              <div className="umpire-demo__eyebrow">Playable example</div>
              <h2 className="umpire-demo__title">Minesweeper</h2>
            </div>
            <span className="umpire-demo__panel-accent">64 fields / 192 rules</span>
          </div>

          <div className="umpire-demo__panel-body minesweeper-demo__panel-body">
            <div className="minesweeper-demo__status-bar">
              <div className="minesweeper-demo__status-card">
                <span className="minesweeper-demo__face" aria-hidden="true">
                  {STATUS_FACE[conditions.gameStatus]}
                </span>
                <div className="minesweeper-demo__status-copy">
                  <span className="minesweeper-demo__status-label">{STATUS_LABEL[conditions.gameStatus]}</span>
                  <span className="minesweeper-demo__status-subtitle">
                    {board ? `seed ${seed}` : 'mines arm on first dig'}
                  </span>
                </div>
              </div>

              <div className="minesweeper-demo__counter-card">
                <span className="minesweeper-demo__counter-label">Mines Left</span>
                <span
                  className={cls(
                    'minesweeper-demo__counter-value',
                    MINE_COUNT - flaggedCount < 0 && 'minesweeper-demo__counter-value--negative',
                  )}
                >
                  {MINE_COUNT - flaggedCount}
                </span>
              </div>
            </div>

            <div className="minesweeper-demo__controls">
              <div className="minesweeper-demo__mode-toggle" aria-label="Interaction mode">
                <button
                  type="button"
                  aria-pressed={!conditions.flagMode}
                  className={cls(
                    'minesweeper-demo__mode-button',
                    !conditions.flagMode && 'minesweeper-demo__mode-button--active',
                  )}
                  onClick={() => setConditions((current) => ({ ...current, flagMode: false }))}
                >
                  Dig
                </button>
                <button
                  type="button"
                  aria-pressed={conditions.flagMode}
                  className={cls(
                    'minesweeper-demo__mode-button',
                    conditions.flagMode && 'minesweeper-demo__mode-button--active',
                  )}
                  onClick={() => setConditions((current) => ({ ...current, flagMode: true }))}
                >
                  Flag
                </button>
              </div>

              <button
                type="button"
                className="minesweeper-demo__new-game"
                onClick={resetGame}
              >
                New Game
              </button>
            </div>

            <div className="minesweeper-demo__board-shell">
              <div
                className="minesweeper-demo__grid"
                style={{ gridTemplateColumns: `repeat(${BOARD_WIDTH}, minmax(44px, 1fr))` }}
              >
                {CELL_ORDER.map((cell) => {
                  const key = cellKey(cell.x, cell.y)
                  const cellAvailability = availability[key]
                  const value = values[key]
                  const currentCell = activeBoard[key]
                  const isRevealed = value === 'revealed'
                  const isMine = isRevealed && currentCell.isMine
                  const adjacentMines = currentCell.adjacentMines

                  return (
                    <button
                      key={key}
                      type="button"
                      aria-disabled={!cellAvailability.enabled}
                      aria-label={`Cell ${cell.x + 1}, ${cell.y + 1}: ${describeCellValue(value)}`}
                      className={cls(
                        'minesweeper-demo__cell',
                        !isRevealed && 'minesweeper-demo__cell--hidden',
                        isRevealed && 'minesweeper-demo__cell--revealed',
                        value === 'flagged' && 'minesweeper-demo__cell--flagged',
                        isMine && 'minesweeper-demo__cell--mine',
                        !cellAvailability.enabled && 'minesweeper-demo__cell--disabled',
                      )}
                      onClick={() => handleCellClick(cell)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        // Touch devices use the explicit mode toggle instead of long-press hacks.
                        toggleFlag(cell)
                      }}
                      onMouseEnter={() => inspect(cell)}
                      onFocus={() => inspect(cell)}
                    >
                      {value === 'flagged' && <span className="minesweeper-demo__flag">⚑</span>}
                      {isMine && <span className="minesweeper-demo__mine">✺</span>}
                      {isRevealed && !isMine && adjacentMines > 0 && (
                        <span
                          className={cls(
                            'minesweeper-demo__number',
                            numberClass(adjacentMines),
                          )}
                        >
                          {adjacentMines}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {!compact && (
          <section className={cls('umpire-demo__panel', 'minesweeper-demo__panel', 'minesweeper-demo__panel--inspector')}>
            <div className="umpire-demo__panel-header">
              <div>
                <div className="umpire-demo__eyebrow">Live state</div>
                <h2 className="umpire-demo__title">Cell Inspector</h2>
              </div>
              <span className="umpire-demo__panel-accent">{inspectedCell.key}</span>
            </div>

            <div className="umpire-demo__panel-body minesweeper-demo__inspector-body">
              <div className="minesweeper-demo__inspector-meta">
                <div className="minesweeper-demo__inspector-row">
                  <span className="minesweeper-demo__inspector-label">Coords</span>
                  <span className="minesweeper-demo__inspector-value">
                    ({inspectedCell.x}, {inspectedCell.y})
                  </span>
                </div>
                <div className="minesweeper-demo__inspector-row">
                  <span className="minesweeper-demo__inspector-label">Value</span>
                  <span className="minesweeper-demo__inspector-value">
                    {describeCellValue(values[inspectedCell.key])}
                  </span>
                </div>
                <div className="minesweeper-demo__inspector-row">
                  <span className="minesweeper-demo__inspector-label">Board</span>
                  <span className="minesweeper-demo__inspector-value">
                    {board
                      ? inspectedMeta.isMine
                        ? 'mine'
                        : inspectedMeta.adjacentMines === 0
                          ? 'clear'
                          : `${inspectedMeta.adjacentMines} adjacent`
                      : 'unseeded'}
                  </span>
                </div>
              </div>

              <div className="umpire-demo__conditions">
                <span className="umpire-demo__conditions-label">Conditions</span>
                <code className="umpire-demo__conditions-code">
                  {`{ gameStatus: '${conditions.gameStatus}', flagMode: ${conditions.flagMode} }`}
                </code>
              </div>

              <section className="umpire-demo__json-shell">
                <div className="umpire-demo__json-header">
                  <span className="umpire-demo__json-title">availability</span>
                  <span className="umpire-demo__json-meta">useUmpire()</span>
                </div>
                <pre className="umpire-demo__code-block">
                  <code>{inspectedJson}</code>
                </pre>
              </section>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
