import type {
  AvailabilityMap,
  FieldDef,
  Foul,
  InputValues,
  ValidationMap,
} from '@umpire/core'
import type {
  WriteCandidate,
  WriteCheckResult,
  WriteIssue,
} from '@umpire/write'

// ── Validation adapter protocol ──

export type UmpireValidationAdapter<F extends Record<string, FieldDef>> = {
  run(
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): {
    errors: Partial<Record<keyof F & string, string>>
    normalizedErrors: Array<{ field: string; message: string }>
    result: unknown
    schemaFields: Array<keyof F & string>
  }
  validators?: ValidationMap<F>
}

// ── Issue types ──

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

export type DrizzleRuleIssue<F extends Record<string, FieldDef>> =
  | WriteIssue<F>
  | {
      kind: 'foul'
      field: keyof F & string
      message: string
      foul: Foul<F>
    }

export type DrizzleSchemaIssue<F extends Record<string, FieldDef>> = {
  field: keyof F & string
  message: string
}

// ── Write options ──

export type DrizzleWriteOptions<C = Record<string, unknown>> = {
  context?: C
  unknownKeys?: 'reject' | 'strip'
  nonWritableKeys?: 'reject' | 'strip'
}

// ── Debug ──

export type DrizzleWriteDebug<F extends Record<string, FieldDef>> = {
  candidate: WriteCandidate<F>
  validationResult?: unknown
}

// ── Single-table result ──

export type DrizzleWriteResult<
  F extends Record<string, FieldDef>,
  TData = Record<string, unknown>,
> = {
  ok: boolean
  data: TData
  availability: AvailabilityMap<F>
  issues: {
    columns: DrizzleColumnIssue<F>[]
    rules: DrizzleRuleIssue<F>[]
    schema: DrizzleSchemaIssue<F>[]
  }
  debug: DrizzleWriteDebug<F>
}

// ── Model result ──

export type DrizzleModelWriteResult<
  F extends Record<string, FieldDef>,
  TDataByTable extends Record<string, Record<string, unknown>> = Record<
    string,
    Record<string, unknown>
  >,
> = Omit<DrizzleWriteResult<F, never>, 'data'> & {
  dataByTable: TDataByTable
}

// ── Validation runner ──

export type DrizzleValidationRun<F extends Record<string, FieldDef>> = {
  schemaIssues: DrizzleSchemaIssue<F>[]
  validationResult: unknown
}

export function runValidationAdapter<F extends Record<string, FieldDef>>(
  adapter: UmpireValidationAdapter<F> | undefined,
  availability: AvailabilityMap<F>,
  candidate: Record<string, unknown>,
): DrizzleValidationRun<F> | undefined {
  if (!adapter) return undefined

  const adapterResult = adapter.run(availability, candidate)

  const schemaIssues: DrizzleSchemaIssue<F>[] =
    adapterResult.normalizedErrors.map((err) => ({
      field: err.field as keyof F & string,
      message: err.message,
    }))

  return {
    schemaIssues,
    validationResult: adapterResult.result,
  }
}

// ── Result combination ──

export type CombineDrizzleWriteInput<
  F extends Record<string, FieldDef>,
  TData,
> = {
  write: WriteCheckResult<F>
  columnIssues: DrizzleColumnIssue<F>[]
  validation: DrizzleValidationRun<F> | undefined
  data: TData
  debug: Record<string, unknown>
}

export function combineDrizzleWriteResult<
  F extends Record<string, FieldDef>,
  TData,
>(input: CombineDrizzleWriteInput<F, TData>): DrizzleWriteResult<F, TData> {
  const { write, columnIssues, validation, data, debug } = input

  const ruleIssues: DrizzleRuleIssue<F>[] = [
    ...write.issues,
    ...write.fouls.map((foul) => ({
      kind: 'foul' as const,
      field: foul.field,
      message: foul.reason,
      foul,
    })),
  ]

  const schemaIssues = validation?.schemaIssues ?? []

  const ok =
    columnIssues.length === 0 &&
    ruleIssues.length === 0 &&
    schemaIssues.length === 0

  return {
    ok,
    data,
    availability: write.availability,
    issues: {
      columns: columnIssues,
      rules: ruleIssues,
      schema: schemaIssues,
    },
    debug: {
      candidate: write.candidate,
      ...(validation?.validationResult !== undefined
        ? { validationResult: validation.validationResult }
        : {}),
      ...debug,
    },
  }
}
