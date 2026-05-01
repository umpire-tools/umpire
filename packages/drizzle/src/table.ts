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
  default?: unknown
  defaultFn?: (() => unknown) | undefined
  onUpdateFn?: (() => unknown) | undefined
  primary: boolean
  generated?: unknown
  generatedIdentity?: { type?: 'always' | 'byDefault' } | undefined
  dimensions?: number
}

export function fromDrizzleTable<
  T extends Table,
  const O extends FromDrizzleTableOptions = {},
>(
  table: T,
  options: O = {} as O,
): FromDrizzleTableResult<FromDrizzleTableFields<T, O>> {
  const columns = getColumns(table) as Record<string, DrizzleColumn>
  const exclude = new Set(options.exclude ?? [])
  const fields: Record<string, FieldDef> = {}

  for (const [fieldName, column] of Object.entries(columns)) {
    if (exclude.has(fieldName) || shouldExcludeColumn(column)) {
      continue
    }

    fields[fieldName] = fieldFromColumn(fieldName, column, options)
  }

  return {
    fields: fields as FromDrizzleTableFields<T, O>,
    rules: [],
  }
}

function fieldFromColumn(
  fieldName: string,
  column: DrizzleColumn,
  options: FromDrizzleTableOptions,
): FieldDef {
  const field: FieldDef = {
    required:
      options.required?.[fieldName] ??
      (column.notNull &&
        !column.hasDefault &&
        column.defaultFn === undefined &&
        column.onUpdateFn === undefined),
  }

  const defaultValue = staticDefaultValue(column.default)
  if (defaultValue.hasDefault) {
    field.default = defaultValue.value
  }

  const isEmpty = resolveIsEmpty(
    options.isEmpty?.[fieldName] ?? strategyForColumn(column),
  )
  if (isEmpty !== isEmptyPresent) {
    field.isEmpty = isEmpty
  }

  return field
}

function shouldExcludeColumn(column: DrizzleColumn): boolean {
  return (
    column.primary ||
    column.generated !== undefined ||
    column.generatedIdentity !== undefined
  )
}

function strategyForColumn(column: DrizzleColumn): DrizzleIsEmptyStrategy {
  if (typeof column.dimensions === 'number' && column.dimensions > 0) {
    return 'array'
  }

  if (column.enumValues !== undefined) {
    return 'present'
  }

  const [dataType, constraint] = column.dataType.split(' ')

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

function staticDefaultValue(
  defaultValue: unknown,
):
  | { hasDefault: true; value: string | number | boolean | null }
  | { hasDefault: false } {
  if (
    defaultValue === null ||
    typeof defaultValue === 'string' ||
    typeof defaultValue === 'number' ||
    typeof defaultValue === 'boolean'
  ) {
    return { hasDefault: true, value: defaultValue }
  }

  return { hasDefault: false }
}
