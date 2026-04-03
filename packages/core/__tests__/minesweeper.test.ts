/**
 * Minesweeper × Umpire integration tests.
 *
 * Proves that @umpire/core can model a non-form domain:
 * each cell is a field, game state is conditions, reasons are
 * machine-readable enums. No forms anywhere in sight.
 *
 * Test board (4×4, mines at (1,1) and (2,3)):
 *
 *   . . . .   (row 0)
 *   . * . .   (row 1)
 *   . . . .   (row 2)
 *   . . * .   (row 3)
 *
 * Adjacency:
 *   1 1 1 0
 *   1 * 2 1
 *   1 2 2 1
 *   0 1 * 1
 */

import {
  buildBoard,
  cascadeReveal,
  cellKey,
  checkWin,
  createMinesweeperUmpire,
  type Board,
  type GameConditions,
  type Values,
} from './helpers/minesweeper-engine.js'

// ── Shared fixtures ────────────────────────────────────────────────────

const MINES: Array<[number, number]> = [[1, 1], [2, 3]]
let board: Board

beforeEach(() => {
  board = buildBoard(4, 4, MINES)
})

const playing: GameConditions = { gameStatus: 'playing', flagMode: false }
const playingFlagMode: GameConditions = { gameStatus: 'playing', flagMode: true }
const lost: GameConditions = { gameStatus: 'lost', flagMode: false }
const won: GameConditions = { gameStatus: 'won', flagMode: false }

// ── Tests ──────────────────────────────────────────────────────────────

describe('minesweeper × umpire', () => {
  test('field generation — 16 fields, all enabled at game start', () => {
    const ump = createMinesweeperUmpire(board)
    const availability = ump.check({}, playing)

    const keys = Object.keys(availability)
    expect(keys).toHaveLength(16)

    for (const key of keys) {
      expect(availability[key].enabled).toBe(true)
      expect(availability[key].reasons).toEqual([])
    }
  })

  test('reveal safe cell — cell becomes disabled with ALREADY_REVEALED', () => {
    const ump = createMinesweeperUmpire(board)
    const values: Values = { [cellKey(0, 0)]: 'revealed' }
    const availability = ump.check(values, playing)

    // Revealed cell is disabled
    expect(availability[cellKey(0, 0)].enabled).toBe(false)
    expect(availability[cellKey(0, 0)].reason).toBe('ALREADY_REVEALED')

    // Other cells remain enabled
    expect(availability[cellKey(1, 0)].enabled).toBe(true)
    expect(availability[cellKey(3, 3)].enabled).toBe(true)
  })

  test('cascade reveal — flood-fill through zero-adjacent cells', () => {
    const ump = createMinesweeperUmpire(board)

    // Cell (3,0) has 0 adjacent mines — should cascade
    const values = cascadeReveal(board, {}, 3, 0)

    // Verify cascade happened: (3,0) and its reachable neighbors are revealed
    expect(values[cellKey(3, 0)]).toBe('revealed')

    // (2,0) has adjacentMines=1, gets revealed but doesn't propagate
    expect(values[cellKey(2, 0)]).toBe('revealed')

    // Mine cells should NOT be revealed
    expect(values[cellKey(1, 1)]).toBeUndefined()
    expect(values[cellKey(2, 3)]).toBeUndefined()

    // Check availability: all revealed cells show ALREADY_REVEALED
    const availability = ump.check(values, playing)
    for (const [key, val] of Object.entries(values)) {
      if (val === 'revealed') {
        expect(availability[key].enabled).toBe(false)
        expect(availability[key].reasons).toContain('ALREADY_REVEALED')
      }
    }

    // Unrevealed, non-mine cells should still be enabled
    for (const [key, cell] of Object.entries(board)) {
      if (!cell.isMine && values[key] !== 'revealed') {
        expect(availability[key].enabled).toBe(true)
      }
    }
  })

  test('flag a cell — disabled in reveal mode, enabled in flag mode', () => {
    const ump = createMinesweeperUmpire(board)
    const values: Values = { [cellKey(1, 1)]: 'flagged' }

    // Reveal mode: flagged cell is blocked
    const revealAvail = ump.check(values, playing)
    expect(revealAvail[cellKey(1, 1)].enabled).toBe(false)
    expect(revealAvail[cellKey(1, 1)].reasons).toContain('FLAGGED')

    // Flag mode: flagged cell is interactive (can unflag)
    const flagAvail = ump.check(values, playingFlagMode)
    expect(flagAvail[cellKey(1, 1)].enabled).toBe(true)
  })

  test('unflag a cell — returns to enabled', () => {
    const ump = createMinesweeperUmpire(board)

    // Flag then unflag
    const flagged: Values = { [cellKey(1, 1)]: 'flagged' }
    expect(ump.check(flagged, playing)[cellKey(1, 1)].enabled).toBe(false)

    const unflagged: Values = { [cellKey(1, 1)]: undefined }
    expect(ump.check(unflagged, playing)[cellKey(1, 1)].enabled).toBe(true)
  })

  test('hit a mine — game over, all cells disabled', () => {
    const ump = createMinesweeperUmpire(board)
    const values: Values = { [cellKey(1, 1)]: 'revealed' }
    const availability = ump.check(values, lost)

    for (const key of Object.keys(board)) {
      expect(availability[key].enabled).toBe(false)
      expect(availability[key].reasons).toContain('GAME_OVER')
    }
  })

  test('win condition — all non-mine cells revealed', () => {
    const ump = createMinesweeperUmpire(board)

    // Reveal every non-mine cell
    const values: Values = {}
    for (const [key, cell] of Object.entries(board)) {
      if (!cell.isMine) {
        values[key] = 'revealed'
      }
    }

    expect(checkWin(board, values)).toBe(true)

    // After setting gameStatus to won, all cells disabled
    const availability = ump.check(values, won)
    for (const key of Object.keys(board)) {
      expect(availability[key].enabled).toBe(false)
      expect(availability[key].reasons).toContain('GAME_OVER')
    }
  })

  test('reasons accumulate — revealed cell during game over has both reasons', () => {
    const ump = createMinesweeperUmpire(board)
    const values: Values = { [cellKey(0, 0)]: 'revealed' }
    const availability = ump.check(values, lost)

    const cell = availability[cellKey(0, 0)]
    expect(cell.enabled).toBe(false)
    expect(cell.reasons).toContain('GAME_OVER')
    expect(cell.reasons).toContain('ALREADY_REVEALED')
    expect(cell.reasons).toHaveLength(2)
  })

  test('scale test — expert board (480 cells, 1440 rules)', () => {
    // 30×16 board with 99 mines at fixed positions
    const expertMines: Array<[number, number]> = []
    let count = 0
    for (let y = 0; y < 16 && count < 99; y++) {
      for (let x = 0; x < 30 && count < 99; x++) {
        // Place mines in a deterministic diagonal-ish pattern
        if ((x + y * 3) % 5 === 0) {
          expertMines.push([x, y])
          count++
        }
      }
    }

    const expertBoard = buildBoard(30, 16, expertMines)
    const start = performance.now()
    const ump = createMinesweeperUmpire(expertBoard)
    const constructionTime = performance.now() - start

    const checkStart = performance.now()
    const availability = ump.check({}, playing)
    const checkTime = performance.now() - checkStart

    // All 480 cells exist and are enabled
    expect(Object.keys(availability)).toHaveLength(480)
    for (const key of Object.keys(availability)) {
      expect(availability[key].enabled).toBe(true)
    }

    // Log timing for manual review — no hard assertion since CI varies
    console.log(
      `Expert board: construction=${constructionTime.toFixed(0)}ms, check=${checkTime.toFixed(0)}ms`,
    )
  })

  test('play() detects stale flags after cascade reveal', () => {
    const ump = createMinesweeperUmpire(board)

    // Flag cell (3,0) which has 0 adjacent mines.
    // In flag mode, the cell is enabled (can unflag) — so we use
    // flagMode: true for the "before" snapshot.
    const beforeValues: Values = { [cellKey(3, 0)]: 'flagged' }
    const before = { values: beforeValues, conditions: playingFlagMode }

    // Now a cascade reveal covers (3,0) — the flag becomes stale.
    // The game switches back to reveal mode.
    const afterValues = cascadeReveal(board, {}, 3, 0)
    expect(afterValues[cellKey(3, 0)]).toBe('revealed')

    const after = { values: afterValues, conditions: playing }

    const fouls = ump.play(before, after)

    // Cell was enabled+flagged before, now disabled+revealed.
    // play() should report a foul recommending cleanup.
    const c30Foul = fouls.find(f => f.field === cellKey(3, 0))
    expect(c30Foul).toBeDefined()
    expect(c30Foul!.suggestedValue).toBeUndefined()
  })
})
