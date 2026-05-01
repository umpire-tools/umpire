import { field, type FieldDef, type FieldRef, type Rule } from '@umpire/core'
import type { Table } from 'drizzle-orm'

import {
  fromDrizzleTable,
  type FromDrizzleTableFields,
  type FromDrizzleTableOptions,
} from './table.js'

export type FromDrizzleModelTableEntry<
  T extends Table = Table,
  O extends FromDrizzleTableOptions = FromDrizzleTableOptions,
> = T | ({ table: T } & O)

export type FromDrizzleModelConfig = Record<string, FromDrizzleModelTableEntry>

type UnionToIntersection<U> = (
  U extends unknown ? (value: U) => void : never
) extends (value: infer I) => void
  ? I
  : never

type EntryTable<E> = E extends { table: infer T extends Table }
  ? T
  : E extends Table
    ? E
    : never

type EntryOptions<E> = E extends { table: Table }
  ? Omit<E, 'table'> extends FromDrizzleTableOptions
    ? Omit<E, 'table'>
    : {}
  : {}

type NamespacedFields<
  Namespace extends string,
  T extends Table,
  O extends FromDrizzleTableOptions,
> = {
  [K in keyof FromDrizzleTableFields<T, O> &
    string as `${Namespace}.${K}`]: FromDrizzleTableFields<T, O>[K]
}

type NamespaceName<M extends FromDrizzleModelConfig> = keyof M & string

type LocalFieldName<
  M extends FromDrizzleModelConfig,
  N extends NamespaceName<M>,
> = keyof FromDrizzleTableFields<EntryTable<M[N]>, EntryOptions<M[N]>> & string

export type FromDrizzleModelFields<M extends FromDrizzleModelConfig> =
  UnionToIntersection<
    {
      [N in NamespaceName<M>]: NamespacedFields<
        N,
        EntryTable<M[N]>,
        EntryOptions<M[N]>
      >
    }[NamespaceName<M>]
  > extends infer F extends Record<string, FieldDef>
    ? F
    : never

export type FromDrizzleModelResult<M extends FromDrizzleModelConfig> = {
  fields: FromDrizzleModelFields<M>
  rules: Rule<FromDrizzleModelFields<M>>[]
  name: <N extends NamespaceName<M>, K extends LocalFieldName<M, N>>(
    namespace: N,
    fieldName: K,
  ) => `${N}.${K}`
  field: <N extends NamespaceName<M>, K extends LocalFieldName<M, N>>(
    namespace: N,
    fieldName: K,
  ) => FieldRef<unknown, `${N}.${K}`>
}

export function fromDrizzleModel<const M extends FromDrizzleModelConfig>(
  model: M,
): FromDrizzleModelResult<M> {
  const fields: Record<string, FieldDef> = {}

  for (const [namespace, entry] of Object.entries(model)) {
    const table = getEntryTable(entry)
    const tableOptions = getEntryOptions(entry)
    const tableResult = fromDrizzleTable(table, tableOptions)

    for (const [fieldName, fieldDef] of Object.entries(
      tableResult.fields,
    ) as Array<[string, FieldDef]>) {
      const namespacedName = `${namespace}.${fieldName}`
      if (fields[namespacedName]) {
        throw new Error(
          `[@umpire/drizzle] Duplicate model field "${namespacedName}"`,
        )
      }

      fields[namespacedName] = fieldDef
    }
  }

  return {
    fields: fields as FromDrizzleModelFields<M>,
    rules: [],
    name(namespace, fieldName) {
      return `${namespace}.${fieldName}`
    },
    field(namespace, fieldName) {
      return field(`${namespace}.${fieldName}`)
    },
  }
}

function getEntryTable(entry: FromDrizzleModelTableEntry): Table {
  if (isEntryConfig(entry)) {
    return entry.table
  }

  return entry
}

function getEntryOptions(
  entry: FromDrizzleModelTableEntry,
): FromDrizzleTableOptions {
  if (!isEntryConfig(entry)) {
    return {}
  }

  const { table: _table, ...options } = entry
  return options
}

function isEntryConfig(
  entry: FromDrizzleModelTableEntry,
): entry is { table: Table } & FromDrizzleTableOptions {
  return typeof entry === 'object' && entry !== null && 'table' in entry
}
