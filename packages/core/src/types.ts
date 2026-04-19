export interface FieldDef<V = unknown> {
  required?: boolean
  default?: V
  isEmpty?(value: V | null | undefined): boolean
}

export type JsonPrimitive = string | number | boolean | null

export interface NamedCheckMetadata {
  readonly __check: string
  readonly params?: Readonly<Record<string, JsonPrimitive>>
}

export interface NamedCheck<T = unknown> extends NamedCheckMetadata {
  readonly validate: (value: NonNullable<T>) => boolean
}

export type FieldValue<T extends FieldDef> = T extends FieldDef<infer V> ? V : unknown

export type FunctionValidator<T = unknown> = (value: NonNullable<T>) => boolean

export type SafeParseValidator<T = unknown> = {
  safeParse(value: NonNullable<T>): { success: boolean }
}

export type StringTestValidator = {
  test(value: string): boolean
}

export type FieldValidator<T = unknown> =
  | FunctionValidator<T>
  | NamedCheck<T>
  | SafeParseValidator<T>
  | StringTestValidator

export type ValidationResult = {
  valid: boolean
  error?: string
}

export type ValidationOutcome = boolean | ValidationResult

export type ValidationFunction<T = unknown> = (value: NonNullable<T>) => ValidationOutcome

export type ValidationValidator<T = unknown> =
  | ValidationFunction<T>
  | NamedCheck<T>
  | SafeParseValidator<T>
  | StringTestValidator

export type ValidationEntry<T = unknown> =
  | ValidationValidator<T>
  | {
      validator: ValidationValidator<T>
      error?: string
    }

export type ValidationMap<F extends Record<string, FieldDef>> = Partial<{
  [K in keyof F & string]: ValidationEntry<FieldValue<F[K]>>
}>

export type FieldStatus = {
  enabled: boolean
  satisfied: boolean
  fair: boolean
  required: boolean
  reason: string | null
  reasons: string[]
  valid?: boolean
  error?: string
}

export type FieldAvailability = FieldStatus

export type AvailabilityMap<F extends Record<string, FieldDef>> = {
  [K in keyof F]: FieldStatus
}

export type FieldValues<F extends Record<string, FieldDef>> = {
  [K in keyof F]?: FieldValue<F[K]>
}

export type InputValues = Record<string, unknown>


export type Snapshot<C extends Record<string, unknown>> = {
  values: InputValues
  conditions?: C
}

export type Foul<F extends Record<string, FieldDef>> = {
  [K in keyof F & string]: {
    field: K
    reason: string
    suggestedValue: FieldValue<F[K]> | undefined
  }
}[keyof F & string]

export type RuleTraceDependency = {
  kind: string
  id: string
}

export type RuleTraceReason = {
  code: string
  data?: Record<string, unknown>
}

export type RuleTraceAttachmentResult = {
  value?: unknown
  reason?: string | null
  reasons?: RuleTraceReason[]
  dependencies?: RuleTraceDependency[]
  [key: string]: unknown
}

export type RuleTraceAttachment<
  Values extends Record<string, unknown> = Record<string, unknown>,
  C extends Record<string, unknown> = Record<string, unknown>,
> = {
  kind: string
  id: string
  inspect(
    values: Values,
    conditions: C,
    prev?: Values,
  ): RuleTraceAttachmentResult | null | undefined
}

export type ChallengeTraceAttachment = RuleTraceAttachmentResult & {
  kind: string
  id: string
}

export type ChallengeDirectReason = {
  rule: string
  reason: string | null
  passed: boolean
  trace?: ChallengeTraceAttachment[]
  [key: string]: unknown
}

export type ChallengeTrace = {
  field: string
  enabled: boolean
  fair: boolean
  directReasons: ChallengeDirectReason[]
  transitiveDeps: Array<{
    field: string
    enabled: boolean
    fair: boolean
    reason: string | null
    causedBy: Array<Omit<ChallengeDirectReason, 'passed'>>
  }>
  oneOfResolution: {
    group: string
    activeBranch: string | null
    method: string
    branches: Record<string, { fields: string[]; anySatisfied: boolean }>
  } | null
}

export type UmpireGraphEdge = {
  from: string
  to: string
  type: string
}

export type UmpireGraph = {
  nodes: string[]
  edges: UmpireGraphEdge[]
}

export type ScorecardField<F extends Record<string, FieldDef>> = {
  field: keyof F & string
  value: unknown
  present: boolean
  satisfied: boolean
  enabled: boolean
  fair: boolean
  required: boolean
  reason: string | null
  reasons: string[]
  valid?: boolean
  error?: string
  changed: boolean
  cascaded: boolean
  foul: Foul<F> | null
  incoming: Array<{ field: string; type: string }>
  outgoing: Array<{ field: string; type: string }>
  trace?: ChallengeTrace
}

export type ScorecardTransition<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  before: Snapshot<C> | null
  changedFields: Array<keyof F & string>
  fouls: Foul<F>[]
  foulsByField: Partial<Record<keyof F & string, Foul<F>>>
  fouledFields: Array<keyof F & string>
  directlyFouledFields: Array<keyof F & string>
  cascadingFields: Array<keyof F & string>
}

export type ScorecardOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  before?: Snapshot<C>
  includeChallenge?: boolean
}

export type ScorecardResult<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  check: AvailabilityMap<F>
  graph: UmpireGraph
  fields: Record<keyof F & string, ScorecardField<F>>
  transition: ScorecardTransition<F, C>
}

export type RuleEvaluation = {
  enabled: boolean
  fair?: boolean
  reason: string | null
  reasons?: string[]
}

export type Rule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: string
  targets: (keyof F & string)[]
  sources: (keyof F & string)[]
  evaluate: (
    values: FieldValues<F>,
    conditions: C,
    prev?: FieldValues<F>,
    fields?: F,
    availability?: Partial<AvailabilityMap<F>>,
  ) => Map<string, RuleEvaluation>
}

export interface Umpire<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> {
  check(values: InputValues, conditions?: C, prev?: InputValues): AvailabilityMap<F>
  play(before: Snapshot<C>, after: Snapshot<C>): Foul<F>[]
  init(overrides?: InputValues): FieldValues<F>
  scorecard(
    snapshot: Snapshot<C>,
    options?: ScorecardOptions<F, C>,
  ): ScorecardResult<F, C>
  challenge(
    field: keyof F & string,
    values: InputValues,
    conditions?: C,
    prev?: InputValues,
  ): ChallengeTrace
  graph(): UmpireGraph
}

export type FieldsOf<U> = U extends Umpire<infer F, any> ? F : never
