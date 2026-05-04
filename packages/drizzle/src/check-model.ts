import type { FieldDef, Umpire } from '@umpire/core'
import {
  checkCreate as writeCheckCreate,
  checkPatch as writeCheckPatch,
} from '@umpire/write'

import type {
  FromDrizzleModelConfig,
  FromDrizzleModelTableEntry,
} from './model.js'
import { getEntryTable } from './model.js'
import { getEntryOptions } from './model.js'
import { getTableColumnsMeta, type DrizzleColumnMeta } from './table.js'
import {
  buildCreateDataFromCandidate,
  shapeCreateInput,
  shapePatchData,
} from './writability.js'
import {
  composeWriteResult,
  runWriteValidationAdapter,
  type WriteValidationAdapter,
} from '@umpire/write'
import {
  type DrizzleColumnIssue,
  type DrizzleModelWriteResult,
  type DrizzleWriteOptions,
} from './result.js'

// ── Namespace utilities ──

function splitKey(key: string): { namespace: string; localKey: string } | null {
  const dotIndex = key.indexOf('.')
  if (dotIndex === -1) return null
  return {
    namespace: key.slice(0, dotIndex),
    localKey: key.slice(dotIndex + 1),
  }
}

// ── Options type ──

type ModelWriteOptions<
  F extends Record<string, FieldDef>,
  C = Record<string, unknown>,
> = DrizzleWriteOptions<C> & {
  validation?: WriteValidationAdapter<F>
}

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
  const namespaceEntries = Object.entries(modelConfig) as Array<
    [string, FromDrizzleModelTableEntry]
  >

  // Build per-namespace metadata
  const namespaceMeta = new Map(
    namespaceEntries.map(([ns, entry]) => {
      const table = getEntryTable(entry)
      const tableMeta = getTableColumnsMeta(table)
      const exclude = new Set(getEntryOptions(entry).exclude ?? [])
      return [ns, { tableMeta, exclude }] as const
    }),
  )

  // Split flat data by namespace
  const byNamespace = new Map<string, Record<string, unknown>>()
  const unknownKeys: DrizzleColumnIssue<F>[] = []

  for (const key of Object.keys(data)) {
    const split = splitKey(key)
    if (!split || !namespaceMeta.has(split.namespace)) {
      const reject = !options || options.unknownKeys !== 'strip'
      if (reject) {
        unknownKeys.push({
          kind: 'unknown',
          field: key,
          message: `unknown field "${key}"`,
        })
      }
      continue
    }

    let nsData = byNamespace.get(split.namespace)
    if (!nsData) {
      nsData = {}
      byNamespace.set(split.namespace, nsData)
    }
    nsData[split.localKey] = data[key]
  }

  // Shape per namespace
  const flatShapedData: Record<string, unknown> = {}
  const allColumnIssues: DrizzleColumnIssue<F>[] = [...unknownKeys]

  for (const [ns, meta] of namespaceMeta) {
    const nsData = byNamespace.get(ns) ?? {}
    const { shapedData, columnIssues } = shapeCreateInput(
      meta.tableMeta,
      meta.exclude,
      nsData,
      options,
    )

    // Map local issue fields to flat namespaced names
    for (const issue of columnIssues) {
      allColumnIssues.push({
        kind: issue.kind,
        field: `${ns}.${issue.field}` as keyof F & string,
        message: issue.message,
      })
    }

    // Re-namespace shaped data back to flat keys
    for (const [localKey, value] of Object.entries(shapedData)) {
      flatShapedData[`${ns}.${localKey}`] = value
    }
  }

  // Run write check on flat data
  const write = writeCheckCreate(ump, flatShapedData, options?.context)

  // Build data by table
  const dataByTable: Record<string, Record<string, unknown>> = {}
  const acceptedInputKeys = new Set(Object.keys(flatShapedData))

  for (const [ns, meta] of namespaceMeta) {
    // Build accepted input for this namespace (local keys)
    const nsAcceptedInput: Record<string, unknown> = {}
    for (const flatKey of acceptedInputKeys) {
      const split = splitKey(flatKey)
      if (split?.namespace === ns) {
        nsAcceptedInput[split.localKey] = flatShapedData[flatKey]
      }
    }

    // Build candidate excerpt for this namespace (local keys from flat candidate)
    const nsCandidate: Record<string, unknown> = {}
    for (const [flatKey, value] of Object.entries(write.candidate)) {
      const split = splitKey(flatKey)
      if (split?.namespace === ns) {
        nsCandidate[split.localKey] = value
      }
    }

    // Build namespaced availability (local keys)
    const nsAvailability: Record<string, { enabled?: boolean }> = {}
    const flatAvail = write.availability as Record<
      string,
      { enabled?: boolean }
    >
    for (const flatKey of Object.keys(flatAvail)) {
      const split = splitKey(flatKey)
      if (split?.namespace === ns) {
        nsAvailability[split.localKey] = flatAvail[flatKey]
      }
    }

    dataByTable[ns] = buildCreateDataFromCandidate(
      meta.tableMeta,
      meta.exclude,
      nsCandidate,
      nsAcceptedInput,
      nsAvailability,
    )
  }

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
  const namespaceEntries = Object.entries(modelConfig) as Array<
    [string, FromDrizzleModelTableEntry]
  >

  // Build per-namespace metadata
  const namespaceMeta = new Map(
    namespaceEntries.map(([ns, entry]) => {
      const table = getEntryTable(entry)
      const tableMeta = getTableColumnsMeta(table)
      const exclude = new Set(getEntryOptions(entry).exclude ?? [])
      return [ns, { tableMeta, exclude }] as const
    }),
  )

  // Split flat patch by namespace
  const byNamespace = new Map<string, Record<string, unknown>>()
  const unknownKeys: DrizzleColumnIssue<F>[] = []

  for (const key of Object.keys(patch)) {
    const split = splitKey(key)
    if (!split || !namespaceMeta.has(split.namespace)) {
      const reject = !options || options.unknownKeys !== 'strip'
      if (reject) {
        unknownKeys.push({
          kind: 'unknown',
          field: key,
          message: `unknown field "${key}"`,
        })
      }
      continue
    }

    let nsData = byNamespace.get(split.namespace)
    if (!nsData) {
      nsData = {}
      byNamespace.set(split.namespace, nsData)
    }
    nsData[split.localKey] = patch[key]
  }

  // Shape per namespace
  const flatShapedPatch: Record<string, unknown> = {}
  const allColumnIssues: DrizzleColumnIssue<F>[] = [...unknownKeys]

  for (const [ns, meta] of namespaceMeta) {
    const nsPatch = byNamespace.get(ns) ?? {}
    const { shapedData, columnIssues } = shapePatchData(
      meta.tableMeta,
      meta.exclude,
      nsPatch,
      options,
    )

    for (const issue of columnIssues) {
      allColumnIssues.push({
        kind: issue.kind,
        field: `${ns}.${issue.field}` as keyof F & string,
        message: issue.message,
      })
    }

    for (const [localKey, value] of Object.entries(shapedData)) {
      flatShapedPatch[`${ns}.${localKey}`] = value
    }
  }

  // Run initial write check on flat patch data
  const initialWrite = writeCheckPatch(
    ump,
    existing,
    flatShapedPatch,
    options?.context,
  )

  // Build stale-value clears from two sources
  const rawFlatClears: Record<string, null> = {}

  for (const foul of initialWrite.fouls) {
    const status = (
      initialWrite.availability as Record<string, { enabled?: boolean }>
    )[foul.field]
    if (status?.enabled !== false) continue

    const userSubmittedNonNull =
      Object.hasOwn(flatShapedPatch, foul.field) &&
      flatShapedPatch[foul.field] != null

    if (existing[foul.field] != null && !userSubmittedNonNull) {
      rawFlatClears[foul.field] = null
    }
  }

  for (const [field, value] of Object.entries(flatShapedPatch)) {
    const status = (
      initialWrite.availability as Record<string, { enabled?: boolean }>
    )[field]
    if (status?.enabled === false && value == null && existing[field] != null) {
      rawFlatClears[field] = null
    }
  }

  // Shape per-namespace through column filter
  const flatStaleClears: Record<string, unknown> = {}

  for (const [ns, meta] of namespaceMeta) {
    const localRawClears: Record<string, null> = {}
    for (const flatKey of Object.keys(rawFlatClears)) {
      const split = splitKey(flatKey)
      if (split?.namespace === ns) {
        localRawClears[split.localKey] = null
      }
    }

    if (Object.keys(localRawClears).length === 0) continue

    const { shapedData: localStaleClears } = shapePatchData(
      meta.tableMeta,
      meta.exclude,
      localRawClears,
      { unknownKeys: 'strip', nonWritableKeys: 'strip' },
    )

    for (const [localKey, value] of Object.entries(localStaleClears)) {
      flatStaleClears[`${ns}.${localKey}`] = value
    }
  }

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
  const dataByTable: Record<string, Record<string, unknown>> = {}

  for (const [ns] of namespaceMeta) {
    const nsData: Record<string, unknown> = {}
    for (const [flatKey, value] of Object.entries(flatStaleClears)) {
      const split = splitKey(flatKey)
      if (split?.namespace === ns) {
        nsData[split.localKey] = value
      }
    }
    for (const [flatKey, value] of Object.entries(flatShapedPatch)) {
      const split = splitKey(flatKey)
      if (split?.namespace === ns) {
        const status = (
          write.availability as Record<string, { enabled?: boolean }>
        )[flatKey]
        if (status?.enabled !== false) {
          nsData[split.localKey] = value
        }
      }
    }
    dataByTable[ns] = nsData
  }

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
