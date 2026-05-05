import type { FieldDef, Umpire } from '@umpire/core'
import {
  checkCreate as writeCheckCreate,
  checkPatch as writeCheckPatch,
  composeWriteResult,
  runWriteValidationAdapter,
  splitNamespacedField,
  type WriteCheckResult,
  type WriteValidationAdapter,
} from '@umpire/write'

import type {
  FromDrizzleModelConfig,
  FromDrizzleModelTableEntry,
} from './model.js'
import { getEntryTable } from './model.js'
import { getEntryOptions } from './model.js'
import { getTableColumnsMeta } from './table.js'
import {
  buildCreateDataFromCandidate,
  shapeCreateInput,
  shapePatchData,
} from './writability.js'
import {
  type DrizzleColumnIssue,
  type DrizzleModelWriteResult,
  type DrizzleWriteOptions,
} from './result.js'

// ── Options type ──

type ModelWriteOptions<
  F extends Record<string, FieldDef>,
  C = Record<string, unknown>,
> = DrizzleWriteOptions<C> & {
  validation?: WriteValidationAdapter<F>
}

type NamespaceMeta = {
  tableMeta: ReturnType<typeof getTableColumnsMeta>
  exclude: Set<string>
}

type AvailabilityByField = Record<string, { enabled?: boolean }>

// ── Model write helpers ──

export function checkDrizzleModelCreate<
  M extends FromDrizzleModelConfig,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  modelConfig: M,
  ump: Umpire<F, C>,
  data: Record<string, unknown>,
  options?: ModelWriteOptions<F, C>,
): DrizzleModelWriteResult<F> {
  const namespaceMeta = buildNamespaceMeta(modelConfig)
  const { flatData: flatShapedData, columnIssues: allColumnIssues } =
    shapeNamespacedInput(namespaceMeta, data, options, 'create')

  // Run write check on flat data
  const write = writeCheckCreate(ump, flatShapedData, options?.context)

  // Build data by table
  const dataByTable = buildCreateDataByTable(
    namespaceMeta,
    flatShapedData,
    write,
  )

  const validation = options?.validation
    ? runWriteValidationAdapter(
        options.validation,
        write.availability,
        write.candidate,
      )
    : undefined

  const composed = composeWriteResult({
    write,
    validation,
    extraIssues: { columns: allColumnIssues },
  })
  return { ...composed, dataByTable }
}

export function checkDrizzleModelPatch<
  M extends FromDrizzleModelConfig,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  modelConfig: M,
  ump: Umpire<F, C>,
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
  options?: ModelWriteOptions<F, C>,
): DrizzleModelWriteResult<F> {
  const namespaceMeta = buildNamespaceMeta(modelConfig)
  const { flatData: flatShapedPatch, columnIssues: allColumnIssues } =
    shapeNamespacedInput(namespaceMeta, patch, options, 'patch')

  // Run initial write check on flat patch data
  const initialWrite = writeCheckPatch(
    ump,
    existing,
    flatShapedPatch,
    options?.context,
  )

  // Build stale-value clears from two sources
  const rawFlatClears = collectDisabledStaleClears(
    initialWrite,
    existing,
    flatShapedPatch,
  )
  const flatStaleClears = shapeNamespacedClears(namespaceMeta, rawFlatClears)

  // Re-run write check only when shaped stale clears exist
  const write =
    Object.keys(flatStaleClears).length === 0
      ? initialWrite
      : writeCheckPatch(
          ump,
          existing,
          { ...flatStaleClears, ...flatShapedPatch },
          options?.context,
        )

  // Build data by table (stale clears + enabled user fields)
  const dataByTable = buildPatchDataByTable(
    namespaceMeta,
    flatStaleClears,
    flatShapedPatch,
    write,
  )

  const validation = options?.validation
    ? runWriteValidationAdapter(
        options.validation,
        write.availability,
        write.candidate,
      )
    : undefined

  const composed = composeWriteResult({
    write,
    validation,
    extraIssues: { columns: allColumnIssues },
  })
  return { ...composed, dataByTable }
}

function buildNamespaceMeta(
  modelConfig: FromDrizzleModelConfig,
): Map<string, NamespaceMeta> {
  const entries = Object.entries(modelConfig) as Array<
    [string, FromDrizzleModelTableEntry]
  >

  return new Map(
    entries.map(([ns, entry]) => {
      const table = getEntryTable(entry)
      const tableMeta = getTableColumnsMeta(table)
      const exclude = new Set(getEntryOptions(entry).exclude ?? [])
      return [ns, { tableMeta, exclude }] as const
    }),
  )
}

function splitByNamespace<F extends Record<string, FieldDef>>(
  namespaceMeta: Map<string, NamespaceMeta>,
  data: Record<string, unknown>,
  options?: DrizzleWriteOptions,
): {
  byNamespace: Map<string, Record<string, unknown>>
  unknownKeys: DrizzleColumnIssue<F>[]
} {
  const byNamespace = new Map<string, Record<string, unknown>>()
  const unknownKeys: DrizzleColumnIssue<F>[] = []

  for (const [key, value] of Object.entries(data)) {
    const split = splitNamespacedField(key)
    if (!split || !namespaceMeta.has(split.namespace)) {
      if (options?.unknownKeys !== 'strip') {
        unknownKeys.push({
          kind: 'unknown',
          field: key,
          message: `unknown field "${key}"`,
        })
      }
      continue
    }

    const nsData = byNamespace.get(split.namespace) ?? {}
    nsData[split.localKey] = value
    byNamespace.set(split.namespace, nsData)
  }

  return { byNamespace, unknownKeys }
}

function shapeNamespacedInput<F extends Record<string, FieldDef>>(
  namespaceMeta: Map<string, NamespaceMeta>,
  data: Record<string, unknown>,
  options: DrizzleWriteOptions | undefined,
  mode: 'create' | 'patch',
): {
  flatData: Record<string, unknown>
  columnIssues: DrizzleColumnIssue<F>[]
} {
  const { byNamespace, unknownKeys } = splitByNamespace<F>(
    namespaceMeta,
    data,
    options,
  )
  const flatData: Record<string, unknown> = {}
  const columnIssues: DrizzleColumnIssue<F>[] = [...unknownKeys]

  for (const [ns, meta] of namespaceMeta) {
    const localData = byNamespace.get(ns) ?? {}
    const shaped =
      mode === 'create'
        ? shapeCreateInput(meta.tableMeta, meta.exclude, localData, options)
        : shapePatchData(meta.tableMeta, meta.exclude, localData, options)

    appendNamespacedIssues(columnIssues, ns, shaped.columnIssues)
    appendNamespacedData(flatData, ns, shaped.shapedData)
  }

  return { flatData, columnIssues }
}

function appendNamespacedIssues<F extends Record<string, FieldDef>>(
  target: DrizzleColumnIssue<F>[],
  namespace: string,
  issues: Array<{
    kind: 'unknown' | 'nonWritable'
    field: string
    message: string
  }>,
): void {
  for (const issue of issues) {
    target.push({
      kind: issue.kind,
      field: `${namespace}.${issue.field}` as keyof F & string,
      message: issue.message,
    })
  }
}

function appendNamespacedData(
  target: Record<string, unknown>,
  namespace: string,
  data: Record<string, unknown>,
): void {
  for (const [localKey, value] of Object.entries(data)) {
    target[`${namespace}.${localKey}`] = value
  }
}

function localRecordForNamespace(
  namespace: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const localData: Record<string, unknown> = {}

  for (const [flatKey, value] of Object.entries(data)) {
    const split = splitNamespacedField(flatKey)
    if (split?.namespace === namespace) {
      localData[split.localKey] = value
    }
  }

  return localData
}

function localAvailabilityForNamespace(
  namespace: string,
  availability: AvailabilityByField,
): AvailabilityByField {
  const localAvailability: AvailabilityByField = {}

  for (const [flatKey, status] of Object.entries(availability)) {
    const split = splitNamespacedField(flatKey)
    if (split?.namespace === namespace) {
      localAvailability[split.localKey] = status
    }
  }

  return localAvailability
}

function buildCreateDataByTable<F extends Record<string, FieldDef>>(
  namespaceMeta: Map<string, NamespaceMeta>,
  flatShapedData: Record<string, unknown>,
  write: WriteCheckResult<F>,
): Record<string, Record<string, unknown>> {
  const dataByTable: Record<string, Record<string, unknown>> = {}
  const availability = write.availability as AvailabilityByField

  for (const [ns, meta] of namespaceMeta) {
    dataByTable[ns] = buildCreateDataFromCandidate(
      meta.tableMeta,
      meta.exclude,
      localRecordForNamespace(ns, write.candidate),
      localRecordForNamespace(ns, flatShapedData),
      localAvailabilityForNamespace(ns, availability),
    )
  }

  return dataByTable
}

function collectDisabledStaleClears<F extends Record<string, FieldDef>>(
  write: WriteCheckResult<F>,
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, null> {
  const availability = write.availability as AvailabilityByField
  const clears: Record<string, null> = {}

  for (const foul of write.fouls) {
    if (availability[foul.field]?.enabled !== false) continue
    if (existing[foul.field] == null) continue
    if (Object.hasOwn(patch, foul.field) && patch[foul.field] != null) continue
    clears[foul.field] = null
  }

  for (const [field, value] of Object.entries(patch)) {
    if (availability[field]?.enabled !== false) continue
    if (value != null || existing[field] == null) continue
    clears[field] = null
  }

  return clears
}

function shapeNamespacedClears(
  namespaceMeta: Map<string, NamespaceMeta>,
  rawFlatClears: Record<string, null>,
): Record<string, unknown> {
  const flatStaleClears: Record<string, unknown> = {}

  for (const [ns, meta] of namespaceMeta) {
    const localRawClears = localRecordForNamespace(ns, rawFlatClears)
    if (Object.keys(localRawClears).length === 0) continue

    const { shapedData } = shapePatchData(
      meta.tableMeta,
      meta.exclude,
      localRawClears,
      { unknownKeys: 'strip', nonWritableKeys: 'strip' },
    )
    appendNamespacedData(flatStaleClears, ns, shapedData)
  }

  return flatStaleClears
}

function buildPatchDataByTable<F extends Record<string, FieldDef>>(
  namespaceMeta: Map<string, NamespaceMeta>,
  flatStaleClears: Record<string, unknown>,
  flatShapedPatch: Record<string, unknown>,
  write: WriteCheckResult<F>,
): Record<string, Record<string, unknown>> {
  const dataByTable: Record<string, Record<string, unknown>> = {}
  const enabledPatch = filterEnabledData(write, flatShapedPatch)
  const flatData = { ...flatStaleClears, ...enabledPatch }

  for (const [ns] of namespaceMeta) {
    dataByTable[ns] = localRecordForNamespace(ns, flatData)
  }

  return dataByTable
}

function filterEnabledData<F extends Record<string, FieldDef>>(
  write: WriteCheckResult<F>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const availability = write.availability as AvailabilityByField
  const enabledData: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (availability[key]?.enabled !== false) {
      enabledData[key] = value
    }
  }

  return enabledData
}
