import type { FieldDef, Rule, Umpire } from '@umpire/core'
import { umpire } from '@umpire/core'
import type { Table } from 'drizzle-orm'

import { checkDrizzleCreate, checkDrizzlePatch } from './check.js'
import {
  checkDrizzleModelCreate,
  checkDrizzleModelPatch,
} from './check-model.js'
import type { FromDrizzleModelConfig, FromDrizzleModelResult } from './model.js'
import { fromDrizzleModel } from './model.js'
import type {
  DrizzleModelWriteResult,
  DrizzleWriteOptions,
  DrizzleWriteResult,
  UmpireValidationAdapter,
} from './result.js'
import { fromDrizzleTable, type FromDrizzleTableOptions } from './table.js'

type WriteOpts<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> = DrizzleWriteOptions<C> & { validation?: UmpireValidationAdapter<F> }

export type DrizzlePolicyOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> = {
  table?: FromDrizzleTableOptions
  fields?: Partial<Record<string, FieldDef>>
  rules?: Rule<F, C>[]
  validation?: UmpireValidationAdapter<F>
  unknownKeys?: 'reject' | 'strip'
  nonWritableKeys?: 'reject' | 'strip'
}

function mergeOpts<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  builder: DrizzlePolicyOptions<F, C>,
  call?: WriteOpts<F, C>,
): WriteOpts<F, C> {
  return {
    context: call?.context ?? undefined,
    unknownKeys: call?.unknownKeys ?? builder.unknownKeys,
    nonWritableKeys: call?.nonWritableKeys ?? builder.nonWritableKeys,
    validation: call?.validation ?? builder.validation,
  }
}

// ── Single-table policy ──

export function createDrizzlePolicy<
  T extends Table,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  table: T,
  options: DrizzlePolicyOptions<Record<string, FieldDef>, C> = {},
): {
  checkCreate(
    data: Record<string, unknown>,
    callOpts?: WriteOpts<Record<string, FieldDef>, C>,
  ): DrizzleWriteResult<Record<string, FieldDef>>
  checkPatch(
    existing: Record<string, unknown>,
    patch: Record<string, unknown>,
    callOpts?: WriteOpts<Record<string, FieldDef>, C>,
  ): DrizzleWriteResult<Record<string, FieldDef>>
  fields: Record<string, FieldDef>
  rules: Rule<Record<string, FieldDef>, C>[]
  ump: Umpire<Record<string, FieldDef>, C>
} {
  const derived = fromDrizzleTable(table, options.table ?? {}) as unknown as {
    fields: Record<string, FieldDef>
    rules: Rule<Record<string, FieldDef>, C>[]
  }

  const fields = { ...derived.fields, ...options.fields } as Record<
    string,
    FieldDef
  >
  const rules = [
    ...derived.rules,
    ...((options.rules ?? []) as Rule<Record<string, FieldDef>, C>[]),
  ]
  const ump = umpire({ fields, rules })

  return {
    fields,
    rules,
    ump,
    checkCreate(data, callOpts) {
      return checkDrizzleCreate(
        table,
        ump,
        data,
        mergeOpts(options, callOpts),
      ) as DrizzleWriteResult<Record<string, FieldDef>>
    },
    checkPatch(existing, patch, callOpts) {
      return checkDrizzlePatch(
        table,
        ump,
        existing,
        patch,
        mergeOpts(options, callOpts),
      ) as DrizzleWriteResult<Record<string, FieldDef>>
    },
  }
}

// ── Model policy ──

export function createDrizzleModelPolicy<
  M extends FromDrizzleModelConfig,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  modelConfig: M,
  options: DrizzlePolicyOptions<Record<string, FieldDef>, C> = {},
): {
  checkCreate(
    data: Record<string, unknown>,
    callOpts?: WriteOpts<Record<string, FieldDef>, C>,
  ): DrizzleModelWriteResult<Record<string, FieldDef>>
  checkPatch(
    existing: Record<string, unknown>,
    patch: Record<string, unknown>,
    callOpts?: WriteOpts<Record<string, FieldDef>, C>,
  ): DrizzleModelWriteResult<Record<string, FieldDef>>
  fields: Record<string, FieldDef>
  rules: Rule<Record<string, FieldDef>, C>[]
  ump: Umpire<Record<string, FieldDef>, C>
  name: FromDrizzleModelResult<M>['name']
  field: FromDrizzleModelResult<M>['field']
} {
  const model = fromDrizzleModel(modelConfig) as unknown as {
    fields: Record<string, FieldDef>
    rules: Rule<Record<string, FieldDef>, C>[]
    name: FromDrizzleModelResult<M>['name']
    field: FromDrizzleModelResult<M>['field']
  }

  const fields = { ...model.fields, ...options.fields } as Record<
    string,
    FieldDef
  >
  const rules = [
    ...model.rules,
    ...((options.rules ?? []) as Rule<Record<string, FieldDef>, C>[]),
  ]
  const ump = umpire({ fields, rules })

  return {
    fields,
    rules,
    ump,
    name: model.name,
    field: model.field,
    checkCreate(data, callOpts) {
      return checkDrizzleModelCreate(
        modelConfig,
        ump,
        data,
        mergeOpts(options, callOpts),
      ) as DrizzleModelWriteResult<Record<string, FieldDef>>
    },
    checkPatch(existing, patch, callOpts) {
      return checkDrizzleModelPatch(
        modelConfig,
        ump,
        existing,
        patch,
        mergeOpts(options, callOpts),
      ) as DrizzleModelWriteResult<Record<string, FieldDef>>
    },
  }
}
