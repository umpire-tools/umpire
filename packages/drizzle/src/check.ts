import type { InferInsertModel, Table } from 'drizzle-orm'
import type { FieldDef, Umpire } from '@umpire/core'
import {
  checkCreate as writeCheckCreate,
  checkPatch as writeCheckPatch,
} from '@umpire/write'

import { getTableColumnsMeta } from './table.js'
import {
  buildCreateDataFromCandidate,
  shapeCreateInput,
  shapePatchData,
} from './writability.js'
import {
  combineDrizzleWriteResult,
  runValidationAdapter,
  type DrizzleWriteOptions,
  type DrizzleWriteResult,
  type UmpireValidationAdapter,
} from './result.js'

function deriveExclude<F extends Record<string, FieldDef>>(
  tableMeta: ReturnType<typeof getTableColumnsMeta>,
  ump: Umpire<F>,
): Set<string> {
  const umpFieldNames = new Set(Object.keys(ump.init()))
  return new Set(
    tableMeta
      .filter((m) => !umpFieldNames.has(m.propertyName) && !m.excluded)
      .map((m) => m.propertyName),
  )
}

type FullDrizzleWriteOptions<
  F extends Record<string, FieldDef>,
  C = Record<string, unknown>,
> = DrizzleWriteOptions<C> & {
  validation?: UmpireValidationAdapter<F>
}

export function checkDrizzleCreate<
  T extends Table,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  table: T,
  ump: Umpire<F, C>,
  data: Record<string, unknown>,
  options?: FullDrizzleWriteOptions<F, C>,
): DrizzleWriteResult<F, InferInsertModel<T>> {
  const tableMeta = getTableColumnsMeta(table)
  const exclude = deriveExclude(tableMeta, ump)

  const { shapedData, columnIssues } = shapeCreateInput(
    tableMeta,
    exclude,
    data,
    options,
  )

  const write = writeCheckCreate(ump, shapedData, options?.context)

  const finalData = buildCreateDataFromCandidate(
    tableMeta,
    exclude,
    write.candidate,
    shapedData,
    write.availability as Record<string, { enabled?: boolean }>,
  )

  const validation = options?.validation
    ? runValidationAdapter(
        options.validation,
        write.availability,
        write.candidate,
      )
    : undefined

  return combineDrizzleWriteResult({
    write,
    columnIssues,
    validation,
    data: finalData as InferInsertModel<T>,
    debug: {},
  })
}

export function checkDrizzlePatch<
  T extends Table,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  table: T,
  ump: Umpire<F, C>,
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
  options?: FullDrizzleWriteOptions<F, C>,
): DrizzleWriteResult<F, Partial<InferInsertModel<T>>> {
  const tableMeta = getTableColumnsMeta(table)
  const exclude = deriveExclude(tableMeta, ump)

  const { shapedData, columnIssues } = shapePatchData(
    tableMeta,
    exclude,
    patch,
    options,
  )

  const initialWrite = writeCheckPatch(
    ump,
    existing,
    shapedData,
    options?.context,
  )

  const rawClears: Record<string, null> = {}
  for (const foul of initialWrite.fouls) {
    const status = (
      initialWrite.availability as Record<string, { enabled?: boolean }>
    )[foul.field]
    if (status?.enabled !== false) continue

    const userSubmittedNonNull =
      Object.hasOwn(shapedData, foul.field) && shapedData[foul.field] != null

    if (existing[foul.field] != null && !userSubmittedNonNull) {
      rawClears[foul.field] = null
    }
  }
  for (const [field, value] of Object.entries(shapedData)) {
    const status = (
      initialWrite.availability as Record<string, { enabled?: boolean }>
    )[field]
    if (status?.enabled === false && value == null && existing[field] != null) {
      rawClears[field] = null
    }
  }

  const { shapedData: staleClears } = shapePatchData(
    tableMeta,
    exclude,
    rawClears,
    { unknownKeys: 'strip', nonWritableKeys: 'strip' },
  )

  const shapedPatchWithClears = { ...staleClears, ...shapedData }
  const write =
    Object.keys(staleClears).length === 0
      ? initialWrite
      : writeCheckPatch(ump, existing, shapedPatchWithClears, options?.context)

  const filteredData: Record<string, unknown> = { ...staleClears }
  for (const key of Object.keys(shapedData)) {
    const status = (
      write.availability as Record<string, { enabled?: boolean }>
    )[key]
    if (status?.enabled !== false) {
      filteredData[key] = shapedData[key]
    }
  }

  const validation = options?.validation
    ? runValidationAdapter(
        options.validation,
        write.availability,
        write.candidate,
      )
    : undefined

  return combineDrizzleWriteResult({
    write,
    columnIssues,
    validation,
    data: filteredData as Partial<InferInsertModel<T>>,
    debug: {},
  })
}
