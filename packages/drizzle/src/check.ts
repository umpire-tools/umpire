import type { InferInsertModel, Table } from 'drizzle-orm'
import type { FieldDef, Umpire } from '@umpire/core'
import {
  checkCreate as writeCheckCreate,
  checkCreateAsync as writeCheckCreateAsync,
  checkPatch as writeCheckPatch,
  checkPatchAsync as writeCheckPatchAsync,
} from '@umpire/write'

import { getTableColumnsMeta } from './table.js'
import {
  buildCreateDataFromCandidate,
  shapeCreateInput,
  shapePatchData,
} from './writability.js'
import {
  composeWriteResult,
  runWriteValidationAdapter,
  runWriteValidationAdapterAsync,
  type AsyncWriteValidationAdapter,
  type AsyncWriteUmpire,
  type WriteCheckResult,
  type WriteValidationAdapter,
} from '@umpire/write'
import { type DrizzleWriteOptions, type DrizzleWriteResult } from './result.js'

type AvailabilityByField = Record<string, { enabled?: boolean }>

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
  validation?: WriteValidationAdapter<F>
}

type AsyncFullDrizzleWriteOptions<
  F extends Record<string, FieldDef>,
  C = Record<string, unknown>,
> = DrizzleWriteOptions<C> & {
  validation?: AsyncWriteValidationAdapter<F>
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
    ? runWriteValidationAdapter(
        options.validation,
        write.availability,
        write.candidate,
      )
    : undefined

  const composed = composeWriteResult({
    write,
    validation,
    extraIssues: { columns: columnIssues },
  })
  return { ...composed, data: finalData as InferInsertModel<T> }
}

export async function checkDrizzleCreateAsync<
  T extends Table,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  table: T,
  ump: AsyncWriteUmpire<F, C>,
  data: Record<string, unknown>,
  options?: AsyncFullDrizzleWriteOptions<F, C>,
): Promise<DrizzleWriteResult<F, InferInsertModel<T>>> {
  const tableMeta = getTableColumnsMeta(table)
  const exclude = deriveExclude(tableMeta, ump as Umpire<F>)

  const { shapedData, columnIssues } = shapeCreateInput(
    tableMeta,
    exclude,
    data,
    options,
  )

  const write = await writeCheckCreateAsync(ump, shapedData, options?.context)

  const finalData = buildCreateDataFromCandidate(
    tableMeta,
    exclude,
    write.candidate,
    shapedData,
    write.availability as Record<string, { enabled?: boolean }>,
  )

  const validation = options?.validation
    ? await runWriteValidationAdapterAsync(
        options.validation,
        write.availability,
        write.candidate,
      )
    : undefined

  const composed = composeWriteResult({
    write,
    validation,
    extraIssues: { columns: columnIssues },
  })
  return { ...composed, data: finalData as InferInsertModel<T> }
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

  const rawClears = collectDisabledStaleClears(
    initialWrite,
    existing,
    shapedData,
  )

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

  const filteredData = filterEnabledPatchData(write, shapedData, staleClears)

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
    extraIssues: { columns: columnIssues },
  })
  return { ...composed, data: filteredData as Partial<InferInsertModel<T>> }
}

export async function checkDrizzlePatchAsync<
  T extends Table,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  table: T,
  ump: AsyncWriteUmpire<F, C>,
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
  options?: AsyncFullDrizzleWriteOptions<F, C>,
): Promise<DrizzleWriteResult<F, Partial<InferInsertModel<T>>>> {
  const tableMeta = getTableColumnsMeta(table)
  const exclude = deriveExclude(tableMeta, ump as Umpire<F>)

  const { shapedData, columnIssues } = shapePatchData(
    tableMeta,
    exclude,
    patch,
    options,
  )

  const initialWrite = await writeCheckPatchAsync(
    ump,
    existing,
    shapedData,
    options?.context,
  )

  const rawClears = collectDisabledStaleClears(
    initialWrite,
    existing,
    shapedData,
  )

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
      : await writeCheckPatchAsync(
          ump,
          existing,
          shapedPatchWithClears,
          options?.context,
        )

  const filteredData = filterEnabledPatchData(write, shapedData, staleClears)

  const validation = options?.validation
    ? await runWriteValidationAdapterAsync(
        options.validation,
        write.availability,
        write.candidate,
      )
    : undefined

  const composed = composeWriteResult({
    write,
    validation,
    extraIssues: { columns: columnIssues },
  })
  return { ...composed, data: filteredData as Partial<InferInsertModel<T>> }
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

function filterEnabledPatchData<F extends Record<string, FieldDef>>(
  write: WriteCheckResult<F>,
  patch: Record<string, unknown>,
  baseData: Record<string, unknown>,
): Record<string, unknown> {
  const availability = write.availability as AvailabilityByField
  const data: Record<string, unknown> = { ...baseData }

  for (const [key, value] of Object.entries(patch)) {
    if (availability[key]?.enabled !== false) {
      data[key] = value
    }
  }

  return data
}
