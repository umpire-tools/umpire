import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { heapStats } from 'bun:jsc'
import { generateHeapSnapshot } from 'bun'
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

function parsePositiveIntegerEnv(name, fallback) {
  const raw = process.env[name] ?? String(fallback)
  const value = Number(raw)

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer. Received: ${raw}`)
  }

  return value
}

const memoryEnabled = process.env.BENCH_MEMORY !== '0'
const heapSnapshotEnabled = process.env.BENCH_HEAP_SNAPSHOT === '1'
const profileDir = process.env.BENCH_PROFILE_DIR ?? './benchmark-profiles'
const isolatedMemoryEnabled = process.env.BENCH_ISOLATED_MEMORY === '1'
const isolatedMemoryChild = process.env.BENCH_ISOLATED_MEMORY_CHILD === '1'
const isolatedMemorySamples = Number(process.env.BENCH_MEMORY_SAMPLES ?? '7')
const isolatedMemoryWarmup = Number(process.env.BENCH_MEMORY_WARMUP ?? '5')
const isolatedResultPrefix = '__UMPIRE_BENCH_MEMORY__'
const leakBenchmarkEnabled = process.env.BENCH_LEAK === '1'
const leakBatches = leakBenchmarkEnabled
  ? parsePositiveIntegerEnv('BENCH_LEAK_BATCHES', 20)
  : 20
const leakIterations = leakBenchmarkEnabled
  ? parsePositiveIntegerEnv('BENCH_LEAK_ITERATIONS', 1000)
  : 1000
const leakWarmup = leakBenchmarkEnabled
  ? parsePositiveIntegerEnv('BENCH_LEAK_WARMUP', 100)
  : 100
const leakInputCount = leakBenchmarkEnabled
  ? parsePositiveIntegerEnv('BENCH_LEAK_INPUTS', 16)
  : 16
const leakRotateInputs = process.env.BENCH_LEAK_ROTATE_INPUTS !== '0'

function forceGc() {
  if (typeof globalThis.Bun?.gc === 'function') {
    globalThis.Bun.gc(true)
  }
}

function readMemoryStats() {
  if (!memoryEnabled) {
    return null
  }

  forceGc()
  const stats = heapStats()

  return {
    heapSize: stats.heapSize,
    heapCapacity: stats.heapCapacity,
    objectCount: stats.objectCount,
  }
}

function readRequiredMemoryStats() {
  const stats = readMemoryStats()

  if (!stats) {
    throw new Error('BENCH_LEAK requires BENCH_MEMORY=1')
  }

  return stats
}

function diffMemoryStats(before, after) {
  if (!before || !after) {
    return null
  }

  return {
    heapSizeBytes: after.heapSize - before.heapSize,
    heapCapacityBytes: after.heapCapacity - before.heapCapacity,
    objectCount: after.objectCount - before.objectCount,
  }
}

function formatBytes(value) {
  const sign = value < 0 ? '-' : ''
  const absolute = Math.abs(value)

  if (absolute < 1024) {
    return `${Math.round(value)} B`
  }

  if (absolute < 1024 * 1024) {
    return `${sign}${(absolute / 1024).toFixed(2)} KiB`
  }

  return `${sign}${(absolute / (1024 * 1024)).toFixed(2)} MiB`
}

function benchmark(name, iterations, fn) {
  let checksum = 0

  checksum += fn()
  const memoryBefore = readMemoryStats()

  const start = performance.now()
  for (let i = 0; i < iterations; i += 1) {
    checksum += fn()
  }
  const totalMs = performance.now() - start
  const memoryAfter = readMemoryStats()

  return {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    opsPerSec: (iterations * 1000) / totalMs,
    checksum,
    memory: diffMemoryStats(memoryBefore, memoryAfter),
  }
}

function average(values) {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values) {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentileValue / 100) * sorted.length) - 1,
  )

  return sorted[index]
}

function variance(values, mean) {
  if (values.length === 0) {
    return 0
  }

  return (
    values.reduce((sum, value) => {
      const delta = value - mean
      return sum + delta * delta
    }, 0) / values.length
  )
}

function linearSlope(values) {
  if (values.length < 2) {
    return 0
  }

  const xMean = (values.length - 1) / 2
  const yMean = average(values)
  let numerator = 0
  let denominator = 0

  for (let index = 0; index < values.length; index += 1) {
    const xDelta = index - xMean
    numerator += xDelta * (values[index] - yMean)
    denominator += xDelta * xDelta
  }

  return denominator === 0 ? 0 : numerator / denominator
}

function runScenarioLoop(scenario, iterations) {
  let checksum = 0

  for (let i = 0; i < iterations; i += 1) {
    checksum += scenario.run()
  }

  return checksum
}

function summarizeScenarioRuns(scenario, runCount) {
  const runs = []

  for (let run = 0; run < runCount; run += 1) {
    runs.push(benchmark(scenario.name, scenario.iterations, scenario.run))
  }

  const totalMsValues = runs.map((result) => result.totalMs)
  const avgMsValues = runs.map((result) => result.avgMs)
  const opsPerSecValues = runs.map((result) => result.opsPerSec)
  const heapSizeValues = runs.map((result) => result.memory?.heapSizeBytes ?? 0)
  const heapCapacityValues = runs.map(
    (result) => result.memory?.heapCapacityBytes ?? 0,
  )
  const objectCountValues = runs.map(
    (result) => result.memory?.objectCount ?? 0,
  )
  const meanTotalMs = average(totalMsValues)
  const meanHeapSizeBytes = average(heapSizeValues)
  const meanObjectCount = average(objectCountValues)

  return {
    name: scenario.name,
    category: scenario.category,
    iterations: scenario.iterations,
    runs,
    checksum: runs[0]?.checksum ?? 0,
    avgTotalMs: meanTotalMs,
    varTotalMs: variance(totalMsValues, meanTotalMs),
    avgMs: average(avgMsValues),
    avgOpsPerSec: average(opsPerSecValues),
    avgHeapSizeBytes: meanHeapSizeBytes,
    avgHeapCapacityBytes: average(heapCapacityValues),
    avgObjectCount: meanObjectCount,
  }
}

function printScenarioResults(results, runCount) {
  const table = results.map((result) => {
    const row = {
      benchmark: result.name,
      category: result.category,
      runs: runCount,
      iterations: result.iterations,
      avg_total_ms: result.avgTotalMs.toFixed(2),
      var_total_ms: result.varTotalMs.toFixed(4),
      avg_ms: result.avgMs.toFixed(3),
      avg_ops_sec: result.avgOpsPerSec.toFixed(2),
    }

    if (memoryEnabled) {
      row.avg_heap_delta = formatBytes(result.avgHeapSizeBytes)
      row.avg_objects_delta = result.avgObjectCount.toFixed(1)
    }

    row.checksum = result.checksum

    return row
  })

  console.table(table)
}

function printCategoryTotals(results, runCount) {
  const categories = ['construction-heavy', 'runtime-heavy']
  const table = categories.map((category) => {
    const totalsByRun = []
    const heapTotalsByRun = []
    const heapCapacityTotalsByRun = []
    const objectTotalsByRun = []

    for (let run = 0; run < runCount; run += 1) {
      let total = 0
      let heapTotal = 0
      let heapCapacityTotal = 0
      let objectTotal = 0

      for (const result of results) {
        if (result.category !== category) {
          continue
        }

        total += result.runs[run]?.totalMs ?? 0
        heapTotal += result.runs[run]?.memory?.heapSizeBytes ?? 0
        heapCapacityTotal += result.runs[run]?.memory?.heapCapacityBytes ?? 0
        objectTotal += result.runs[run]?.memory?.objectCount ?? 0
      }

      totalsByRun.push(total)
      heapTotalsByRun.push(heapTotal)
      heapCapacityTotalsByRun.push(heapCapacityTotal)
      objectTotalsByRun.push(objectTotal)
    }

    const avgTotalMs = average(totalsByRun)
    const avgHeapBytes = average(heapTotalsByRun)
    const avgHeapCapacityBytes = average(heapCapacityTotalsByRun)
    const avgObjectCount = average(objectTotalsByRun)

    const row = {
      category,
      runs: runCount,
      avg_total_ms: avgTotalMs.toFixed(2),
      var_total_ms: variance(totalsByRun, avgTotalMs).toFixed(4),
    }

    if (memoryEnabled) {
      row.avg_heap_delta = formatBytes(avgHeapBytes)
      row.avg_heap_capacity_delta = formatBytes(avgHeapCapacityBytes)
      row.avg_objects_delta = avgObjectCount.toFixed(1)
    }

    return row
  })

  console.table(table)
}

function measureIsolatedScenario(scenario) {
  runScenarioLoop(scenario, isolatedMemoryWarmup)
  let checksum = scenario.run()

  const before = readMemoryStats()
  const start = performance.now()
  checksum += runScenarioLoop(scenario, scenario.iterations)
  const totalMs = performance.now() - start
  const after = readMemoryStats()

  return {
    name: scenario.name,
    category: scenario.category,
    iterations: scenario.iterations,
    totalMs,
    avgMs: totalMs / scenario.iterations,
    opsPerSec: (scenario.iterations * 1000) / totalMs,
    checksum,
    memory: diffMemoryStats(before, after),
  }
}

function printIsolatedMemoryResults(results) {
  const table = results.map((result) => {
    const heapValues = result.samples.map(
      (sample) => sample.memory?.heapSizeBytes ?? 0,
    )
    const heapCapacityValues = result.samples.map(
      (sample) => sample.memory?.heapCapacityBytes ?? 0,
    )
    const objectValues = result.samples.map(
      (sample) => sample.memory?.objectCount ?? 0,
    )
    const totalMsValues = result.samples.map((sample) => sample.totalMs)

    return {
      benchmark: result.name,
      category: result.category,
      samples: result.samples.length,
      iterations: result.iterations,
      median_heap_delta: formatBytes(median(heapValues)),
      p95_heap_delta: formatBytes(percentile(heapValues, 95)),
      median_heap_capacity_delta: formatBytes(median(heapCapacityValues)),
      median_objects_delta: median(objectValues).toFixed(1),
      p95_objects_delta: percentile(objectValues, 95).toFixed(1),
      median_total_ms: median(totalMsValues).toFixed(2),
      checksum: result.samples[0]?.checksum ?? 0,
    }
  })

  console.table(table)
}

function runIsolatedMemoryParent() {
  const results = scenarios.map((scenario) => {
    const samples = []

    for (let sample = 0; sample < isolatedMemorySamples; sample += 1) {
      const child = spawnSync(
        process.execPath,
        [new URL(import.meta.url).pathname],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            BENCH_ISOLATED_MEMORY: undefined,
            BENCH_ISOLATED_MEMORY_CHILD: '1',
            BENCH_ISOLATED_SCENARIO: scenario.name,
            BENCH_MEMORY: '1',
            BENCH_HEAP_SNAPSHOT: '0',
          },
          encoding: 'utf8',
        },
      )

      if (child.status !== 0) {
        process.stdout.write(child.stdout)
        process.stderr.write(child.stderr)
        throw new Error(
          `Isolated memory sample failed for ${scenario.name} with exit code ${child.status}`,
        )
      }

      const resultLine = child.stdout
        .split('\n')
        .find((line) => line.startsWith(isolatedResultPrefix))

      if (!resultLine) {
        process.stdout.write(child.stdout)
        throw new Error(`Missing isolated memory result for ${scenario.name}`)
      }

      samples.push(JSON.parse(resultLine.slice(isolatedResultPrefix.length)))
    }

    return {
      name: scenario.name,
      category: scenario.category,
      iterations: scenario.iterations,
      samples,
    }
  })

  printIsolatedMemoryResults(results)
}

function measureLeakScenario(scenario) {
  runScenarioLoop(scenario, leakWarmup)

  const baseline = readRequiredMemoryStats()
  const samples = []
  let checksum = 0

  for (let batch = 0; batch < leakBatches; batch += 1) {
    const start = performance.now()
    checksum += runScenarioLoop(scenario, leakIterations)
    const totalMs = performance.now() - start
    const memory = readRequiredMemoryStats()

    samples.push({
      batch: batch + 1,
      totalMs,
      heapSizeBytes: memory.heapSize - baseline.heapSize,
      heapCapacityBytes: memory.heapCapacity - baseline.heapCapacity,
      objectCount: memory.objectCount - baseline.objectCount,
    })
  }

  return {
    name: scenario.name,
    inputMode: scenario.inputMode ?? 'fixed',
    inputCount: scenario.inputCount ?? 1,
    batches: leakBatches,
    iterations: leakIterations,
    checksum,
    samples,
  }
}

function printLeakResults(results) {
  const table = results.map((result) => {
    const heapValues = result.samples.map((sample) => sample.heapSizeBytes)
    const capacityValues = result.samples.map(
      (sample) => sample.heapCapacityBytes,
    )
    const objectValues = result.samples.map((sample) => sample.objectCount)
    const totalMsValues = result.samples.map((sample) => sample.totalMs)
    const first = result.samples[0]
    const last = result.samples[result.samples.length - 1]

    return {
      benchmark: result.name,
      input_mode: result.inputMode,
      input_count: result.inputCount,
      batches: result.batches,
      iterations_per_batch: result.iterations,
      total_iterations: result.batches * result.iterations,
      first_heap_delta: formatBytes(first.heapSizeBytes),
      last_heap_delta: formatBytes(last.heapSizeBytes),
      max_heap_delta: formatBytes(Math.max(...heapValues)),
      heap_slope_per_batch: formatBytes(linearSlope(heapValues)),
      last_capacity_delta: formatBytes(last.heapCapacityBytes),
      capacity_slope_per_batch: formatBytes(linearSlope(capacityValues)),
      first_objects_delta: first.objectCount,
      last_objects_delta: last.objectCount,
      objects_slope_per_batch: linearSlope(objectValues).toFixed(2),
      median_batch_ms: median(totalMsValues).toFixed(2),
      checksum: result.checksum,
    }
  })

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
      isEmpty: (value) =>
        value == null || (Array.isArray(value) && value.length === 0),
    }
    fields[startTime] = { default: undefined }
    fields[endTime] = { default: undefined }
    fields[repeatEvery] = { default: 30 }
    fields[everyHour] = {
      default: undefined,
      isEmpty: (value) =>
        value == null || (Array.isArray(value) && value.length === 0),
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
      disables(
        lock,
        [dates, startTime, endTime, repeatEvery, everyHour, notes],
        {
          reason: 'section locked',
        },
      ),
      requires(endTime, startTime, { reason: 'start time required' }),
      requires(repeatEvery, startTime, endTime, {
        reason: 'complete interval required',
      }),
      anyOf(
        requires(submit, dates, { reason: 'schedule incomplete' }),
        requires(submit, startTime, endTime, { reason: 'schedule incomplete' }),
        requires(submit, everyHour, { reason: 'schedule incomplete' }),
      ),
      enabledWhen(submit, check(contact, /@/), {
        reason: 'valid contact required',
      }),
      enabledWhen(
        submit,
        (_values, conditions) => conditions.readonly !== true,
        {
          reason: 'read only',
        },
      ),
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

  const afterValues = structuredClone(beforeValues)

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
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
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
      enabledWhen(
        key,
        (_values, conditions) => conditions.gameStatus === 'playing',
        {
          reason: 'GAME_OVER',
        },
      ),
      enabledWhen(key, (values) => values[key] !== 'revealed', {
        reason: 'ALREADY_REVEALED',
      }),
      enabledWhen(
        key,
        (values, conditions) => {
          if (conditions.flagMode) {
            return true
          }

          return values[key] !== 'flagged'
        },
        {
          reason: 'FLAGGED',
        },
      ),
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

function createValueVariants(values, count, mutate) {
  const variants = []

  for (let index = 0; index < count; index += 1) {
    const variant = structuredClone(values)
    mutate?.(variant, index)
    variants.push(variant)
  }

  return variants
}

function createConditionVariants(conditions, count, mutate) {
  const variants = []

  for (let index = 0; index < count; index += 1) {
    const variant = { ...conditions }
    mutate?.(variant, index)
    variants.push(variant)
  }

  return variants
}

function createRotatingRunner(inputs, run) {
  let index = 0

  return () => {
    const currentIndex = index
    const input = inputs[currentIndex]
    index = (index + 1) % inputs.length
    return run(input, currentIndex)
  }
}

const schedulerConstructionFields = makeSchedulerScenario(60)
const schedulerRuntime = makeSchedulerScenario(60)
const challengeField = 'review_28'
const minesweeper = createExpertMinesweeperScenario()

const runCount = Number(process.env.BENCH_RUNS ?? '5')

const scenarios = [
  {
    name: 'create/scheduler-60-sections',
    category: 'construction-heavy',
    iterations: 25,
    run: () => {
      const scenario = makeSchedulerScenario(60)
      const graph = scenario.engine.graph()
      return graph.nodes.length + graph.edges.length
    },
  },
  {
    name: 'check/scheduler/pro-plan',
    category: 'runtime-heavy',
    iterations: 150,
    run: () => {
      const availability = schedulerRuntime.engine.check(
        schedulerRuntime.beforeValues,
        schedulerRuntime.beforeConditions,
      )
      return sumAvailability(availability)
    },
  },
  {
    name: 'check/scheduler/basic-readonly',
    category: 'runtime-heavy',
    iterations: 150,
    run: () => {
      const availability = schedulerRuntime.engine.check(
        schedulerRuntime.afterValues,
        schedulerRuntime.afterConditions,
        schedulerRuntime.beforeValues,
      )
      return sumAvailability(availability)
    },
  },
  {
    name: 'challenge/review-lock-chain',
    category: 'runtime-heavy',
    iterations: 100,
    run: () => {
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
        (trace.oneOfResolution
          ? Object.keys(trace.oneOfResolution.branches).length
          : 0)
      )
    },
  },
  {
    name: 'play/plan-downgrade',
    category: 'runtime-heavy',
    iterations: 100,
    run: () => {
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

      return (
        fouls.length + fouls.reduce((sum, foul) => sum + foul.field.length, 0)
      )
    },
  },
  {
    name: 'graph/export-scheduler',
    category: 'construction-heavy',
    iterations: 100,
    run: () => {
      const graph = schedulerConstructionFields.engine.graph()
      return graph.nodes.length + graph.edges.length
    },
  },
  {
    name: 'check/minesweeper-expert-board',
    category: 'runtime-heavy',
    iterations: 100,
    run: () => {
      const availability = minesweeper.engine.check(
        minesweeper.values,
        minesweeper.conditions,
      )
      return sumAvailability(availability)
    },
  },
]

function createLeakScenarios() {
  if (!leakRotateInputs) {
    return scenarios
      .filter(
        (scenario) =>
          scenario.name === 'check/scheduler/pro-plan' ||
          scenario.name === 'check/scheduler/basic-readonly' ||
          scenario.name === 'play/plan-downgrade' ||
          scenario.name === 'check/minesweeper-expert-board',
      )
      .map((scenario) => ({
        ...scenario,
        inputMode: 'fixed',
        inputCount: 1,
      }))
  }

  const beforeValues = createValueVariants(
    schedulerRuntime.beforeValues,
    leakInputCount,
    (variant, index) => {
      variant[`contact_${index % 60}`] = `leak${index}@example.com`
      variant[`notes_${(index * 7) % 60}`] = `notes-leak-${index}`
    },
  )
  const afterValues = createValueVariants(
    schedulerRuntime.afterValues,
    leakInputCount,
    (variant, index) => {
      variant[`notes_${(index * 5) % 60}`] = `readonly-leak-${index}`
    },
  )
  const beforeConditions = createConditionVariants(
    schedulerRuntime.beforeConditions,
    leakInputCount,
  )
  const afterConditions = createConditionVariants(
    schedulerRuntime.afterConditions,
    leakInputCount,
  )
  const minesweeperValues = createValueVariants(
    minesweeper.values,
    leakInputCount,
  )
  const minesweeperConditions = createConditionVariants(
    minesweeper.conditions,
    leakInputCount,
  )

  return [
    {
      name: 'check/scheduler/pro-plan',
      inputMode: 'rotating',
      inputCount: leakInputCount,
      run: createRotatingRunner(beforeValues, (values, index) => {
        const availability = schedulerRuntime.engine.check(
          values,
          beforeConditions[index],
        )
        return sumAvailability(availability)
      }),
    },
    {
      name: 'check/scheduler/basic-readonly',
      inputMode: 'rotating',
      inputCount: leakInputCount,
      run: createRotatingRunner(afterValues, (values, index) => {
        const availability = schedulerRuntime.engine.check(
          values,
          afterConditions[index],
          beforeValues[index],
        )
        return sumAvailability(availability)
      }),
    },
    {
      name: 'play/plan-downgrade',
      inputMode: 'rotating',
      inputCount: leakInputCount,
      run: createRotatingRunner(afterValues, (values, index) => {
        const fouls = schedulerRuntime.engine.play(
          {
            values: beforeValues[index],
            conditions: beforeConditions[index],
          },
          {
            values,
            conditions: afterConditions[index],
          },
        )

        return (
          fouls.length + fouls.reduce((sum, foul) => sum + foul.field.length, 0)
        )
      }),
    },
    {
      name: 'check/minesweeper-expert-board',
      inputMode: 'rotating',
      inputCount: leakInputCount,
      run: createRotatingRunner(minesweeperValues, (values, index) => {
        const availability = minesweeper.engine.check(
          values,
          minesweeperConditions[index],
        )
        return sumAvailability(availability)
      }),
    },
  ]
}

if (isolatedMemoryChild) {
  const scenario = scenarios.find(
    (candidate) => candidate.name === process.env.BENCH_ISOLATED_SCENARIO,
  )

  if (!scenario) {
    throw new Error(
      `Unknown isolated memory scenario: ${process.env.BENCH_ISOLATED_SCENARIO}`,
    )
  }

  console.log(
    `${isolatedResultPrefix}${JSON.stringify(measureIsolatedScenario(scenario))}`,
  )
} else if (isolatedMemoryEnabled) {
  runIsolatedMemoryParent()
} else if (leakBenchmarkEnabled) {
  printLeakResults(
    createLeakScenarios().map((scenario) => measureLeakScenario(scenario)),
  )
} else {
  const results = scenarios.map((scenario) =>
    summarizeScenarioRuns(scenario, runCount),
  )

  printScenarioResults(results, runCount)
  printCategoryTotals(results, runCount)

  if (heapSnapshotEnabled) {
    await mkdir(profileDir, { recursive: true })
    const snapshot = generateHeapSnapshot()
    const snapshotPath = `${profileDir}/core-benchmark-${Date.now()}.heapsnapshot.json`
    await Bun.write(snapshotPath, JSON.stringify(snapshot))
    console.log(`Wrote heap snapshot: ${snapshotPath}`)
  }
}
