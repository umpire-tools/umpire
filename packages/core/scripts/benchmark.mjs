import { performance } from 'node:perf_hooks'
import {
  check,
  disables,
  enabledWhen,
  oneOf,
  requires,
  anyOf,
  umpire,
} from '../dist/index.js'

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production'
}

function benchmark(name, iterations, fn) {
  let checksum = 0

  checksum += fn()

  const start = performance.now()
  for (let i = 0; i < iterations; i += 1) {
    checksum += fn()
  }
  const totalMs = performance.now() - start

  return {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    opsPerSec: (iterations * 1000) / totalMs,
    checksum,
  }
}

function printResults(results) {
  const table = results.map((result) => ({
    benchmark: result.name,
    iterations: result.iterations,
    total_ms: result.totalMs.toFixed(2),
    avg_ms: result.avgMs.toFixed(3),
    ops_sec: result.opsPerSec.toFixed(2),
    checksum: result.checksum,
  }))

  console.table(table)
}

function sumAvailability(availability) {
  let enabled = 0
  let required = 0
  let reasons = 0

  for (const field of Object.values(availability)) {
    if (field.enabled) {
      enabled += 1
    }

    if (field.required) {
      required += 1
    }

    reasons += field.reasons.length
  }

  return enabled + required + reasons
}

function clone(values) {
  return structuredClone(values)
}

function makeSchedulerScenario(sectionCount) {
  const fields = {}
  const rules = []

  for (let index = 0; index < sectionCount; index += 1) {
    const mode = `mode_${index}`
    const lock = `lock_${index}`
    const contact = `contact_${index}`
    const dates = `dates_${index}`
    const startTime = `startTime_${index}`
    const endTime = `endTime_${index}`
    const repeatEvery = `repeatEvery_${index}`
    const everyHour = `everyHour_${index}`
    const notes = `notes_${index}`
    const submit = `submit_${index}`
    const review = `review_${index}`

    fields[mode] = { default: 'explicit' }
    fields[lock] = { default: undefined }
    fields[contact] = { default: undefined }
    fields[dates] = {
      default: undefined,
      isEmpty: (value) => value == null || (Array.isArray(value) && value.length === 0),
    }
    fields[startTime] = { default: undefined }
    fields[endTime] = { default: undefined }
    fields[repeatEvery] = { default: 30 }
    fields[everyHour] = {
      default: undefined,
      isEmpty: (value) => value == null || (Array.isArray(value) && value.length === 0),
    }
    fields[notes] = {
      default: '',
      isEmpty: (value) => value == null || value === '',
    }
    fields[submit] = { default: undefined }
    fields[review] = { default: undefined }

    rules.push(
      oneOf(
        `schedule_${index}`,
        {
          explicit: [dates],
          interval: [startTime, endTime, repeatEvery],
          hourly: [everyHour],
        },
        {
          activeBranch: (values) => values[mode] ?? null,
        },
      ),
      disables(lock, [dates, startTime, endTime, repeatEvery, everyHour, notes], {
        reason: 'section locked',
      }),
      requires(endTime, startTime, { reason: 'start time required' }),
      requires(repeatEvery, startTime, endTime, { reason: 'complete interval required' }),
      anyOf(
        requires(submit, dates, { reason: 'schedule incomplete' }),
        requires(submit, startTime, endTime, { reason: 'schedule incomplete' }),
        requires(submit, everyHour, { reason: 'schedule incomplete' }),
      ),
      enabledWhen(submit, check(contact, /@/), {
        reason: 'valid contact required',
      }),
      enabledWhen(submit, (_values, conditions) => conditions.readonly !== true, {
        reason: 'read only',
      }),
      enabledWhen(notes, (_values, conditions) => conditions.plan === 'pro', {
        reason: 'pro plan required',
      }),
      requires(review, submit, { reason: 'submit selection required' }),
    )
  }

  const engine = umpire({ fields, rules })
  const beforeValues = {}

  for (let index = 0; index < sectionCount; index += 1) {
    const mode = `mode_${index}`
    const lock = `lock_${index}`
    const contact = `contact_${index}`
    const dates = `dates_${index}`
    const startTime = `startTime_${index}`
    const endTime = `endTime_${index}`
    const repeatEvery = `repeatEvery_${index}`
    const everyHour = `everyHour_${index}`
    const notes = `notes_${index}`
    const submit = `submit_${index}`
    const review = `review_${index}`
    const branch = index % 3

    beforeValues[lock] = undefined
    beforeValues[contact] = `user${index}@example.com`
    beforeValues[notes] = `notes-${index}`
    beforeValues[submit] = 'ready'
    beforeValues[review] = 'queued'

    if (branch === 0) {
      beforeValues[mode] = 'explicit'
      beforeValues[dates] = [
        `2026-05-${String((index % 20) + 1).padStart(2, '0')}`,
        `2026-06-${String((index % 20) + 1).padStart(2, '0')}`,
      ]
      continue
    }

    if (branch === 1) {
      beforeValues[mode] = 'interval'
      beforeValues[startTime] = '09:00'
      beforeValues[endTime] = '17:00'
      beforeValues[repeatEvery] = 30 + (index % 3) * 15
      continue
    }

    beforeValues[mode] = 'hourly'
    beforeValues[everyHour] = [9, 13, 17]
  }

  const afterValues = clone(beforeValues)

  for (let index = 0; index < sectionCount; index += 1) {
    const mode = `mode_${index}`
    const lock = `lock_${index}`
    const contact = `contact_${index}`
    const dates = `dates_${index}`

    if (index % 4 === 0) {
      afterValues[lock] = true
    }

    if (index % 3 === 1 && index % 2 === 0) {
      afterValues[mode] = 'explicit'
      delete afterValues[dates]
    }

    if (index % 3 === 2 && index % 5 === 0) {
      afterValues[mode] = 'interval'
    }

    if (index % 6 === 0) {
      afterValues[contact] = 'invalid-contact'
    }
  }

  return {
    engine,
    beforeValues,
    afterValues,
    beforeConditions: { plan: 'pro', readonly: false },
    afterConditions: { plan: 'basic', readonly: true },
  }
}

function cellKey(x, y) {
  return `c_${x}_${y}`
}

function buildBoard(width, height, minePositions) {
  const mines = new Set(minePositions.map(([x, y]) => cellKey(x, y)))
  const board = {}
  const offsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ]

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let adjacentMines = 0

      for (const [dx, dy] of offsets) {
        if (mines.has(cellKey(x + dx, y + dy))) {
          adjacentMines += 1
        }
      }

      board[cellKey(x, y)] = {
        x,
        y,
        isMine: mines.has(cellKey(x, y)),
        adjacentMines,
      }
    }
  }

  return board
}

function createExpertMinesweeperScenario() {
  const minePositions = []
  let count = 0

  for (let y = 0; y < 16 && count < 99; y += 1) {
    for (let x = 0; x < 30 && count < 99; x += 1) {
      if ((x + y * 3) % 5 === 0) {
        minePositions.push([x, y])
        count += 1
      }
    }
  }

  const board = buildBoard(30, 16, minePositions)
  const fields = {}
  const rules = []

  for (const key of Object.keys(board)) {
    fields[key] = { default: undefined }
    rules.push(
      enabledWhen(key, (_values, conditions) => conditions.gameStatus === 'playing', {
        reason: 'GAME_OVER',
      }),
      enabledWhen(key, (values) => values[key] !== 'revealed', {
        reason: 'ALREADY_REVEALED',
      }),
      enabledWhen(key, (values, conditions) => {
        if (conditions.flagMode) {
          return true
        }

        return values[key] !== 'flagged'
      }, {
        reason: 'FLAGGED',
      }),
    )
  }

  const engine = umpire({ fields, rules })
  const values = {}

  for (const [key, cell] of Object.entries(board)) {
    if (cell.isMine) {
      if ((cell.x + cell.y) % 4 === 0) {
        values[key] = 'flagged'
      }
      continue
    }

    if ((cell.x * 3 + cell.y) % 7 === 0) {
      values[key] = 'revealed'
    }
  }

  return {
    engine,
    values,
    conditions: { gameStatus: 'playing', flagMode: false },
  }
}

const schedulerConstructionFields = makeSchedulerScenario(60)
const schedulerRuntime = makeSchedulerScenario(60)
const challengeField = 'review_28'
const minesweeper = createExpertMinesweeperScenario()

const results = [
  benchmark('create/scheduler-60-sections', 25, () => {
    const scenario = makeSchedulerScenario(60)
    const graph = scenario.engine.graph()
    return graph.nodes.length + graph.edges.length
  }),
  benchmark('check/scheduler/pro-plan', 150, () => {
    const availability = schedulerRuntime.engine.check(
      schedulerRuntime.beforeValues,
      schedulerRuntime.beforeConditions,
    )
    return sumAvailability(availability)
  }),
  benchmark('check/scheduler/basic-readonly', 150, () => {
    const availability = schedulerRuntime.engine.check(
      schedulerRuntime.afterValues,
      schedulerRuntime.afterConditions,
      schedulerRuntime.beforeValues,
    )
    return sumAvailability(availability)
  }),
  benchmark('challenge/review-lock-chain', 100, () => {
    const trace = schedulerRuntime.engine.challenge(
      challengeField,
      schedulerRuntime.afterValues,
      schedulerRuntime.afterConditions,
      schedulerRuntime.beforeValues,
    )

    return (
      (trace.enabled ? 1 : 0) +
      trace.directReasons.length +
      trace.transitiveDeps.length +
      (trace.oneOfResolution ? Object.keys(trace.oneOfResolution.branches).length : 0)
    )
  }),
  benchmark('play/plan-downgrade', 100, () => {
    const fouls = schedulerRuntime.engine.play(
      {
        values: schedulerRuntime.beforeValues,
        conditions: schedulerRuntime.beforeConditions,
      },
      {
        values: schedulerRuntime.afterValues,
        conditions: schedulerRuntime.afterConditions,
      },
    )

    return fouls.length + fouls.reduce((sum, foul) => sum + foul.field.length, 0)
  }),
  benchmark('graph/export-scheduler', 100, () => {
    const graph = schedulerConstructionFields.engine.graph()
    return graph.nodes.length + graph.edges.length
  }),
  benchmark('check/minesweeper-expert-board', 100, () => {
    const availability = minesweeper.engine.check(minesweeper.values, minesweeper.conditions)
    return sumAvailability(availability)
  }),
]

printResults(results)
