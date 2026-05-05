import type { FieldDef } from '@umpire/core'
import type { WriteComposedResult } from '@umpire/write'

// ── Column issues ──

export type DrizzleColumnIssue<F extends Record<string, FieldDef>> =
  | {
      kind: 'unknown'
      field: string
      message: string
    }
  | {
      kind: 'nonWritable'
      field: keyof F & string
      message: string
    }

// ── Write options ──

export type DrizzleWriteOptions<C = Record<string, unknown>> = {
  context?: C
  unknownKeys?: 'reject' | 'strip'
  nonWritableKeys?: 'reject' | 'strip'
}

// ── Single-table result ──

export type DrizzleWriteResult<
  F extends Record<string, FieldDef>,
  TData = Record<string, unknown>,
> = WriteComposedResult<F, { columns: readonly DrizzleColumnIssue<F>[] }> & {
  data: TData
}

// ── Model result ──

export type DrizzleModelWriteResult<
  F extends Record<string, FieldDef>,
  TDataByTable extends Record<string, Record<string, unknown>> = Record<
    string,
    Record<string, unknown>
  >,
> = WriteComposedResult<F, { columns: readonly DrizzleColumnIssue<F>[] }> & {
  dataByTable: TDataByTable
}
