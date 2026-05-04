import type {
  AvailabilityMap,
  FieldDef,
  Foul,
  InputValues,
  ValidationMap,
} from '@umpire/core'
import type { WriteCandidate, WriteCheckResult, WriteIssue } from './check.js'
import type { NormalizedFieldErrorWithPath } from './namespaced.js'

// ── Validation adapter protocol ──

export type WriteValidationAdapter<F extends Record<string, FieldDef>> = {
  run(
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): {
    errors: Partial<Record<keyof F & string, string>>
    normalizedErrors: NormalizedFieldErrorWithPath[]
    result: unknown
    schemaFields: Array<keyof F & string>
  }
  validators?: ValidationMap<F>
}

// ── Issue types ──

export type WriteRuleIssue<F extends Record<string, FieldDef>> =
  | WriteIssue<F>
  | {
      kind: 'foul'
      field: keyof F & string
      message: string
      foul: Foul<F>
    }

export type WriteSchemaIssue<F extends Record<string, FieldDef>> = {
  field: keyof F & string
  message: string
}

// ── Validation runner ──

export type WriteValidationRun<F extends Record<string, FieldDef>> = {
  schemaIssues: WriteSchemaIssue<F>[]
  validationResult: unknown
}

export function runWriteValidationAdapter<F extends Record<string, FieldDef>>(
  adapter: WriteValidationAdapter<F> | undefined,
  availability: AvailabilityMap<F>,
  candidate: InputValues,
): WriteValidationRun<F> | undefined {
  if (!adapter) return undefined

  const adapterResult = adapter.run(availability, candidate)

  const schemaIssues: WriteSchemaIssue<F>[] =
    adapterResult.normalizedErrors.map((err) => ({
      field: err.field as keyof F & string,
      message: err.message,
    }))

  return {
    schemaIssues,
    validationResult: adapterResult.result,
  }
}

// ── Debug ──

export type WriteDebug<F extends Record<string, FieldDef>> = {
  candidate: WriteCandidate<F>
  validationResult?: unknown
}

// ── Result combination ──

export type ComposeWriteResultInput<
  F extends Record<string, FieldDef>,
  TExtraIssues extends Record<string, readonly unknown[]> = {},
> = {
  write: WriteCheckResult<F>
  validation?: WriteValidationRun<F>
  extraIssues?: TExtraIssues
  debug?: Record<string, unknown>
}

export type WriteComposedResult<
  F extends Record<string, FieldDef>,
  TExtraIssues extends Record<string, readonly unknown[]> = {},
> = {
  ok: boolean
  availability: AvailabilityMap<F>
  issues: {
    rules: WriteRuleIssue<F>[]
    schema: WriteSchemaIssue<F>[]
  } & TExtraIssues
  debug: WriteDebug<F>
}

export function composeWriteResult<
  F extends Record<string, FieldDef>,
  TExtraIssues extends Record<string, readonly unknown[]> = {},
>(
  input: ComposeWriteResultInput<F, TExtraIssues>,
): WriteComposedResult<F, TExtraIssues> {
  const { write, validation, extraIssues, debug: extraDebug } = input

  const ruleIssues: WriteRuleIssue<F>[] = [
    ...write.issues,
    ...write.fouls.map((foul) => ({
      kind: 'foul' as const,
      field: foul.field,
      message: foul.reason,
      foul,
    })),
  ]

  const schemaIssues = validation?.schemaIssues ?? []

  let ok = ruleIssues.length === 0 && schemaIssues.length === 0

  const extraIssueEntries: Record<string, readonly unknown[]> = {
    ...extraIssues,
  }
  for (const group of Object.values(extraIssueEntries)) {
    if (group.length > 0) {
      ok = false
    }
  }

  return {
    ok,
    availability: write.availability,
    issues: {
      rules: ruleIssues,
      schema: schemaIssues,
      ...extraIssueEntries,
    } as WriteComposedResult<F, TExtraIssues>['issues'],
    debug: {
      ...extraDebug,
      candidate: write.candidate,
      ...(validation?.validationResult !== undefined
        ? { validationResult: validation.validationResult }
        : {}),
    },
  }
}
