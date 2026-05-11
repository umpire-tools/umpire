import type {
  AvailabilityMap,
  ChallengeTrace,
  FieldDef,
  FieldValue,
  FieldValues,
  Foul,
  InputValues,
  Rule,
  RuleInspection,
  ScorecardOptions,
  ScorecardResult,
  Snapshot,
  UmpireGraph,
  ValidationOutcome,
  ValidationValidator,
} from '@umpire/core'

export type RuleEvaluation = {
  enabled: boolean
  fair?: boolean
  reason: string | null
  reasons?: string[]
}

export type AsyncRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> = {
  __async: true
  type: string
  targets: (keyof F & string)[]
  sources: (keyof F & string)[]
  evaluate(
    values: FieldValues<F>,
    conditions: C,
    prev: FieldValues<F> | undefined,
    fields: F,
    availability: Partial<AvailabilityMap<F>>,
    signal: AbortSignal,
  ): Promise<Map<string, RuleEvaluation>>
}

export type AnyRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> = Rule<F, C> | AsyncRule<F, C>

export type AsyncValidationFunction<T = unknown> = (
  value: NonNullable<T>,
) => ValidationOutcome | Promise<ValidationOutcome>

export type AsyncSafeParseValidator<T = unknown> = {
  safeParseAsync(value: NonNullable<T>): Promise<{ success: boolean }>
}

export type AnyValidationValidator<T = unknown> =
  | ValidationValidator<T>
  | AsyncValidationFunction<T>
  | AsyncSafeParseValidator<T>

export type AnyValidationEntry<T = unknown> =
  | AnyValidationValidator<T>
  | { validator: AnyValidationValidator<T>; error?: string }

export type AnyValidationMap<F extends Record<string, FieldDef>> = Partial<{
  [K in keyof F & string]: AnyValidationEntry<FieldValue<F[K]>>
}>

export type AsyncRuleEntry<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> = {
  index: number
  id: string
  inspection?: RuleInspection<F, C>
}

export type AsyncScorecardOptions<
  C extends Record<string, unknown> = Record<string, unknown>,
> = ScorecardOptions<C> & { signal?: AbortSignal }

export interface Umpire<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> {
  check(
    values: InputValues,
    conditions?: C,
    prev?: InputValues,
    signal?: AbortSignal,
  ): Promise<AvailabilityMap<F>>
  play(
    before: Snapshot<C>,
    after: Snapshot<C>,
    signal?: AbortSignal,
  ): Promise<Foul<F>[]>
  scorecard(
    snapshot: Snapshot<C>,
    options?: AsyncScorecardOptions<C>,
  ): Promise<ScorecardResult<F, C>>
  challenge(
    field: keyof F & string,
    values: InputValues,
    conditions?: C,
    prev?: InputValues,
  ): Promise<ChallengeTrace>
  init(overrides?: InputValues): FieldValues<F>
  graph(): UmpireGraph
  rules(): AsyncRuleEntry<F, C>[]
}
