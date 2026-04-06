import type {
  FieldDef,
  InputValues,
  Umpire,
} from '@umpire/core'
import type {
  ReadTable,
  ReadTableInspection,
} from '@umpire/reads'
import type {
  AnyReadInspection,
  AnySnapshot,
  DevtoolsFoulEvent,
  RegisterFn,
  RegisterOptions,
  RegistryEntry,
} from './types.js'

const registry = new Map<string, RegistryEntry>()
const listeners = new Set<() => void>()

let foulLogDepth = 50
let registryVersion = 0

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

function isReadInspection(
  value: unknown,
): value is ReadTableInspection<Record<string, unknown>, Record<string, unknown>> {
  return typeof value === 'object' &&
    value !== null &&
    'graph' in value &&
    'nodes' in value &&
    'values' in value
}

function isReadTable<
  ReadInput extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
>(
  value: RegisterOptions<ReadInput, Reads>['reads'],
): value is ReadTable<ReadInput, Reads> {
  return typeof value === 'function' ||
    (typeof value === 'object' &&
      value !== null &&
      'inspect' in value)
}

function resolveReadsInspection<
  F extends Record<string, FieldDef>,
  ReadInput extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
>(
  values: InputValues<F>,
  options?: RegisterOptions<ReadInput, Reads>,
): AnyReadInspection | null {
  const reads = options?.reads

  if (!reads) {
    return null
  }

  if (isReadInspection(reads)) {
    return reads as AnyReadInspection
  }

  if (!isReadTable(reads)) {
    return null
  }

  const input = (options.readInput ?? values) as ReadInput

  return reads.inspect(input) as AnyReadInspection
}

function buildFoulLog(
  previousLog: DevtoolsFoulEvent[],
  entry: RegistryEntry,
  nextRenderIndex: number,
): DevtoolsFoulEvent[] {
  const directFields = new Set(entry.scorecard.transition.directlyFouledFields)
  const freshEvents = entry.scorecard.transition.fouls.map((foul) => ({
    cascaded: !directFields.has(foul.field),
    field: foul.field,
    reason: foul.reason,
    renderIndex: nextRenderIndex,
    suggestedValue: foul.suggestedValue,
    timestamp: Date.now(),
  }))

  return [...previousLog, ...freshEvents].slice(-foulLogDepth)
}

export const register: RegisterFn = (id, ump, values, conditions, options) => {
  if (process.env.NODE_ENV === 'production' && process.env.UMPIRE_INTERNAL !== 'true') {
    return
  }

  const existing = registry.get(id)
  const previous = (existing?.snapshot as {
    conditions?: typeof conditions
    values: typeof values
  } | null) ?? null
  const currentSnapshot = {
    values,
    conditions,
  }

  const scorecard = ump.scorecard(currentSnapshot, {
    before: previous ?? undefined,
  }) as RegistryEntry['scorecard']
  const renderIndex = (existing?.renderIndex ?? 0) + 1

  const nextEntry: RegistryEntry = {
    foulLog: [],
    id,
    previous,
    reads: resolveReadsInspection(values, options),
    renderIndex,
    scorecard,
    snapshot: currentSnapshot as AnySnapshot,
    ump: ump as RegistryEntry['ump'],
    updatedAt: Date.now(),
  }

  nextEntry.foulLog = buildFoulLog(existing?.foulLog ?? [], nextEntry, renderIndex)

  registry.set(id, nextEntry)
  registryVersion += 1
  notify()
}

export function unregister(id: string) {
  if (!registry.delete(id)) {
    return
  }

  registryVersion += 1
  notify()
}

export function subscribe(listener: () => void) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function snapshot() {
  return new Map(registry)
}

export function getRegistryVersion() {
  return registryVersion
}

export function setFoulLogDepth(depth: number) {
  foulLogDepth = Math.max(1, Math.floor(depth))
}

export function resetRegistry() {
  registry.clear()
  listeners.clear()
  foulLogDepth = 50
  registryVersion = 0
}
