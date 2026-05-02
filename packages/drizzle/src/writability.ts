import type { DrizzleColumnMeta } from './table.js'

export type RawColumnIssue = {
  kind: 'unknown' | 'nonWritable'
  field: string
  message: string
}

export type DrizzleKeyHandlingOptions = {
  unknownKeys?: 'reject' | 'strip'
  nonWritableKeys?: 'reject' | 'strip'
}

function defaultOptions(): Required<DrizzleKeyHandlingOptions> {
  return { unknownKeys: 'reject', nonWritableKeys: 'reject' }
}

function isNonWritable(
  meta: DrizzleColumnMeta,
  exclude: ReadonlySet<string>,
  includeUpdateManaged: boolean,
): boolean {
  if (meta.excluded) return true
  if (exclude.has(meta.propertyName)) return true
  if (includeUpdateManaged && meta.isUpdateManaged) return true
  return false
}

function shapeInput(
  tableMeta: DrizzleColumnMeta[],
  exclude: ReadonlySet<string>,
  data: Record<string, unknown>,
  options: DrizzleKeyHandlingOptions,
  includeUpdateManaged: boolean,
): { shapedData: Record<string, unknown>; columnIssues: RawColumnIssue[] } {
  const opts = { ...defaultOptions(), ...options }
  const metaByProperty = new Map(tableMeta.map((m) => [m.propertyName, m]))
  const shapedData: Record<string, unknown> = {}
  const columnIssues: RawColumnIssue[] = []

  for (const key of Object.keys(data)) {
    const meta = metaByProperty.get(key)

    if (!meta) {
      if (opts.unknownKeys === 'strip') continue
      columnIssues.push({
        kind: 'unknown',
        field: key,
        message: `unknown field "${key}"`,
      })
      continue
    }

    if (isNonWritable(meta, exclude, includeUpdateManaged)) {
      if (opts.nonWritableKeys === 'strip') continue
      columnIssues.push({
        kind: 'nonWritable',
        field: key,
        message: `"${key}" is not writable`,
      })
      continue
    }

    shapedData[key] = data[key]
  }

  return { shapedData, columnIssues }
}

export function shapeCreateInput(
  tableMeta: DrizzleColumnMeta[],
  exclude: ReadonlySet<string>,
  data: Record<string, unknown>,
  options?: DrizzleKeyHandlingOptions,
): { shapedData: Record<string, unknown>; columnIssues: RawColumnIssue[] } {
  return shapeInput(tableMeta, exclude, data, options ?? {}, false)
}

export function shapePatchData(
  tableMeta: DrizzleColumnMeta[],
  exclude: ReadonlySet<string>,
  patch: Record<string, unknown>,
  options?: DrizzleKeyHandlingOptions,
): { shapedData: Record<string, unknown>; columnIssues: RawColumnIssue[] } {
  return shapeInput(tableMeta, exclude, patch, options ?? {}, true)
}

export function buildCreateDataFromCandidate(
  tableMeta: DrizzleColumnMeta[],
  exclude: ReadonlySet<string>,
  candidate: Record<string, unknown>,
  acceptedInput: Record<string, unknown>,
  availability?: Record<string, { enabled?: boolean }>,
): Record<string, unknown> {
  const metaByProperty = new Map(tableMeta.map((m) => [m.propertyName, m]))
  const acceptedInputKeys = new Set(Object.keys(acceptedInput))
  const data: Record<string, unknown> = {}

  for (const key of Object.keys(acceptedInput)) {
    if (availability?.[key]?.enabled === false) continue
    data[key] = acceptedInput[key]
  }

  for (const key of Object.keys(candidate)) {
    if (acceptedInputKeys.has(key)) continue

    const meta = metaByProperty.get(key)
    if (!meta) continue
    if (isNonWritable(meta, exclude, false)) continue
    if (availability?.[key]?.enabled === false) continue

    if (meta.hasStaticDefault) {
      data[key] = meta.staticDefault
    }
  }

  return data
}
