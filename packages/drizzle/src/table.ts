import {
  isEmptyArray,
  isEmptyObject,
  isEmptyPresent,
  isEmptyString,
  type FieldDef,
  type Rule,
} from '@umpire/core'
import { getColumns, type Column, type Table } from 'drizzle-orm'

export type DrizzleIsEmptyStrategy =
  | 'array'
  | 'bigint'
  | 'boolean'
  | 'number'
  | 'object'
  | 'present'
  | 'string'

export type FromDrizzleTableOptions = {
  exclude?: readonly string[]
  isEmpty?: Record<
    string,
    DrizzleIsEmptyStrategy | NonNullable<FieldDef['isEmpty']>
  >
  required?: Record<string, boolean>
}

export type FromDrizzleTableResult<
  F extends Record<string, FieldDef> = Record<string, FieldDef>,
> = {
  fields: F
  rules: Rule<F>[]
}

type DrizzleTableColumns<T extends Table> = T['_']['columns']

type DrizzleTableColumnName<T extends Table> = Extract<
  keyof DrizzleTableColumns<T>,
  string
>

type ExcludedColumnName<O extends FromDrizzleTableOptions> =
  O['exclude'] extends readonly (infer K)[] ? Extract<K, string> : never

type IsWritableColumn<C> = C extends Column
  ? C extends { primary: true }
    ? false
    : C['_']['isPrimaryKey'] extends true
      ? false
      : C['_']['generated'] extends undefined
        ? C['_']['identity'] extends undefined
          ? true
          : false
        : false
  : false

type WritableColumnName<T extends Table, O extends FromDrizzleTableOptions> = {
  [K in DrizzleTableColumnName<T>]: K extends ExcludedColumnName<O>
    ? never
    : IsWritableColumn<DrizzleTableColumns<T>[K]> extends true
      ? K
      : never
}[DrizzleTableColumnName<T>]

export type FromDrizzleTableFields<
  T extends Table,
  O extends FromDrizzleTableOptions = FromDrizzleTableOptions,
> = Record<WritableColumnName<T, O>, FieldDef>

type DrizzleColumn = Column & {
  name: string
  notNull: boolean
  hasDefault: boolean
  default?: unknown
  defaultFn?: (() => unknown) | undefined
  onUpdateFn?: (() => unknown) | undefined
  primary: boolean
  generated?: unknown
  generatedIdentity?: { type?: 'always' | 'byDefault' } | undefined
  enumValues?: unknown
  dataType: string
  dimensions?: number
}

export type DrizzleColumnMeta = {
  propertyName: string
  dbColumnName: string
  writable: boolean
  excluded: boolean
  required: boolean
  hasStaticDefault: boolean
  staticDefault?: string | number | boolean | null
  hasRuntimeDefault: boolean
  hasSqlDefault: boolean
  isUpdateManaged: boolean
  dimensions?: number
  hasEnumValues: boolean
  dataType: string
}

export function getTableColumnsMeta(table: Table): DrizzleColumnMeta[] {
  const columns = getColumns(table) as Record<string, DrizzleColumn>
  return Object.entries(columns).map(([propertyName, column]) => {
    const excluded = shouldExcludeColumn(column)
    const isStaticDefault =
      column.default === null ||
      typeof column.default === 'string' ||
      typeof column.default === 'number' ||
      typeof column.default === 'boolean'
    return {
      propertyName,
      dbColumnName: column.name,
      writable: !excluded,
      excluded,
      required:
        column.notNull &&
        !column.hasDefault &&
        column.defaultFn === undefined &&
        column.onUpdateFn === undefined,
      hasStaticDefault: isStaticDefault,
      staticDefault: isStaticDefault
        ? (column.default as string | number | boolean | null)
        : undefined,
      hasRuntimeDefault: column.defaultFn !== undefined,
      hasSqlDefault: column.default !== undefined && !isStaticDefault,
      isUpdateManaged: column.onUpdateFn !== undefined,
      dimensions: column.dimensions,
      hasEnumValues: column.enumValues !== undefined,
      dataType: column.dataType,
    }
  })
}

export function fromDrizzleTable<
  T extends Table,
  const O extends FromDrizzleTableOptions = {},
>(
  table: T,
  options: O = {} as O,
): FromDrizzleTableResult<FromDrizzleTableFields<T, O>> {
  const exclude = new Set(options.exclude ?? [])
  const fields: Record<string, FieldDef> = {}

  for (const meta of getTableColumnsMeta(table)) {
    if (exclude.has(meta.propertyName) || meta.excluded) {
      continue
    }

    const field: FieldDef = {
      required: options.required?.[meta.propertyName] ?? meta.required,
    }

    if (meta.hasStaticDefault) {
      field.default = meta.staticDefault
    }

    const isEmpty = resolveIsEmpty(
      options.isEmpty?.[meta.propertyName] ?? strategyForColumn(meta),
    )
    if (isEmpty !== isEmptyPresent) {
      field.isEmpty = isEmpty
    }

    fields[meta.propertyName] = field
  }

  return {
    fields: fields as FromDrizzleTableFields<T, O>,
    rules: [],
  }
}

function shouldExcludeColumn(column: DrizzleColumn): boolean {
  return (
    column.primary ||
    column.generated !== undefined ||
    column.generatedIdentity !== undefined
  )
}

function strategyForColumn(meta: DrizzleColumnMeta): DrizzleIsEmptyStrategy {
  if (typeof meta.dimensions === 'number' && meta.dimensions > 0) {
    return 'array'
  }

  if (meta.hasEnumValues) {
    return 'present'
  }

  const [dataType, constraint] = meta.dataType.split(' ')

  switch (dataType) {
    case 'array':
      return 'array'
    case 'bigint':
      return 'bigint'
    case 'boolean':
      return 'boolean'
    case 'number':
      return 'number'
    case 'object':
      return constraint === 'json' ? 'object' : 'present'
    case 'string':
      return constraint === 'enum' ? 'present' : 'string'
    default:
      return 'present'
  }
}

function resolveIsEmpty(
  strategy: DrizzleIsEmptyStrategy | NonNullable<FieldDef['isEmpty']>,
): NonNullable<FieldDef['isEmpty']> {
  if (typeof strategy === 'function') {
    return strategy
  }

  switch (strategy) {
    case 'array':
      return isEmptyArray
    case 'bigint':
      return isEmptyBigInt
    case 'boolean':
      return isEmptyBoolean
    case 'number':
      return isEmptyNumber
    case 'object':
      return isEmptyObject
    case 'string':
      return isEmptyString
    case 'present':
      return isEmptyPresent
  }
}

function isEmptyNumber(value: unknown): boolean {
  return typeof value !== 'number' || Number.isNaN(value)
}

function isEmptyBigInt(value: unknown): boolean {
  return typeof value !== 'bigint'
}

function isEmptyBoolean(value: unknown): boolean {
  return typeof value !== 'boolean'
}
