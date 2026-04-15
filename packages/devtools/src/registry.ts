import type {
  FieldDef,
  InputValues,
  ScorecardResult,
  Snapshot,
  Umpire,
} from '@umpire/core'
import type {
  ReadTableInspection,
} from '@umpire/reads'
import type {
  AnyReadInspection,
  ResolvedDevtoolsExtension,
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

const RESERVED_EXTENSION_IDS = new Set([
  'matrix',
  'conditions',
  'fouls',
  'graph',
  'reads',
])

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

function hasReadInspect(
  value: unknown,
): value is {
  inspect(input: Record<string, unknown>): AnyReadInspection
} {
  return typeof value === 'function' ||
    (typeof value === 'object' &&
      value !== null &&
      'inspect' in value &&
      typeof value.inspect === 'function')
}

function resolveReadsInspection<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  ReadInput extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
>(
  values: InputValues,
  options?: RegisterOptions<F, C, ReadInput, Reads>,
): AnyReadInspection | null {
  const reads = options?.reads

  if (!reads) {
    return null
  }

  if (isReadInspection(reads)) {
    return reads as AnyReadInspection
  }

  if (!hasReadInspect(reads)) {
    return null
  }

  const input = (options?.readInput ?? values) as Record<string, unknown>

  return reads.inspect(input) as AnyReadInspection
}

function join(values: string[]) {
  return values.length > 0 ? values.join(', ') : 'none'
}

function readInspectionToExtension(
  inspection: AnyReadInspection,
): ResolvedDevtoolsExtension {
  const sections: ResolvedDevtoolsExtension['view']['sections'] = []

  if (inspection.bridges.length > 0) {
    sections.push({
      kind: 'badges',
      title: 'Bridges',
      badges: inspection.bridges.map((bridge) => ({
        value: `${bridge.read} -> ${bridge.field} (${bridge.type})`,
      })),
    })
  }

  if (inspection.graph.nodes.length > 0) {
    sections.push({
      kind: 'items',
      title: 'Reads',
      items: inspection.graph.nodes.map((readId) => {
        const node = inspection.nodes[readId]

        return {
          id: readId,
          title: readId,
          badge: {
            tone: 'fair',
            value: node.value,
          },
          rows: [
            { label: 'fields', value: join(node.dependsOnFields) },
            { label: 'reads', value: join(node.dependsOnReads) },
          ],
        }
      }),
    })
  }

  return {
    id: 'reads',
    label: 'reads',
    view: {
      empty: 'No reads available in this inspection.',
      sections,
    },
  }
}

function resolveExtensions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  ReadInput extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  values: InputValues,
  conditions: C | undefined,
  previous: Snapshot<C> | null,
  scorecard: ScorecardResult<F, C>,
  readsInspection: AnyReadInspection | null,
  options?: RegisterOptions<F, C, ReadInput, Reads>,
): ResolvedDevtoolsExtension[] {
  const resolved: ResolvedDevtoolsExtension[] = []
  const seen = new Set<string>(RESERVED_EXTENSION_IDS)

  if (readsInspection) {
    resolved.push(readInspectionToExtension(readsInspection))
    seen.add('reads')
  }

  for (const extension of options?.extensions ?? []) {
    if (seen.has(extension.id)) {
      console.warn(
        `[umpire/devtools] Skipping duplicate or reserved extension id "${extension.id}"`,
      )
      continue
    }

    const view = extension.inspect({
      conditions,
      previous,
      scorecard,
      ump,
      values,
    })

    if (!view) {
      continue
    }

    resolved.push({
      id: extension.id,
      label: extension.label ?? extension.id,
      view,
    })
    seen.add(extension.id)
  }

  return resolved
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

export const register: RegisterFn = <
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  ReadInput extends Record<string, unknown> = InputValues,
  Reads extends Record<string, unknown> = Record<string, unknown>,
>(
  id: string,
  ump: Umpire<F, C>,
  values: InputValues,
  conditions?: C,
  options?: RegisterOptions<F, C, ReadInput, Reads>,
) => {
  if (process.env.NODE_ENV === 'production' && process.env.UMPIRE_INTERNAL !== 'true') {
    return
  }

  const existing = registry.get(id)
  const previous = (existing?.snapshot as Snapshot<C> | null) ?? null
  const currentSnapshot: Snapshot<C> = {
    values,
    conditions,
  }

  const scorecard = ump.scorecard(currentSnapshot, {
    before: previous ?? undefined,
  })
  const renderIndex = (existing?.renderIndex ?? 0) + 1
  const readsInspection = resolveReadsInspection(values, options)

  const nextEntry: RegistryEntry = {
    extensions: resolveExtensions(
      ump,
      values,
      conditions,
      previous,
      scorecard,
      readsInspection,
      options,
    ) as RegistryEntry['extensions'],
    foulLog: [],
    id,
    previous: previous as RegistryEntry['previous'],
    reads: readsInspection,
    renderIndex,
    scorecard: scorecard as RegistryEntry['scorecard'],
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
