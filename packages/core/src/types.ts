export type FieldDef = {
  required?: boolean
  default?: unknown
  isEmpty?: (value: unknown) => boolean
}

export type FieldAvailability = {
  enabled: boolean
  required: boolean
  reason: string | null
  reasons: string[]
}

export type AvailabilityMap<F extends Record<string, FieldDef>> = {
  [K in keyof F]: FieldAvailability
}

export type FieldValues<F extends Record<string, FieldDef>> = {
  [K in keyof F]?: unknown
}

export type Snapshot<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  values: FieldValues<F>
  context?: C
}

export type ResetRecommendation<F extends Record<string, FieldDef>> = {
  field: keyof F & string
  reason: string
  suggestedValue: unknown
}

export type ChallengeTrace = {
  field: string
  enabled: boolean
  directReasons: Array<{
    rule: string
    reason: string | null
    passed: boolean
    [key: string]: unknown
  }>
  transitiveDeps: Array<{
    field: string
    enabled: boolean
    reason: string | null
    causedBy: Array<{ rule: string; [key: string]: unknown }>
  }>
  oneOfResolution: {
    group: string
    activeBranch: string | null
    method: string
    branches: Record<string, { fields: string[]; anySatisfied: boolean }>
  } | null
}

export type RuleEvaluation = {
  enabled: boolean
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
    context: C,
    prev?: FieldValues<F>,
    fields?: F,
  ) => Map<string, RuleEvaluation>
}

export interface Umpire<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> {
  check(values: FieldValues<F>, context?: C, prev?: FieldValues<F>): AvailabilityMap<F>
  flag(before: Snapshot<F, C>, after: Snapshot<F, C>): ResetRecommendation<F>[]
  init(overrides?: Partial<FieldValues<F>>): FieldValues<F>
  challenge(
    field: keyof F & string,
    values: FieldValues<F>,
    context?: C,
    prev?: FieldValues<F>,
  ): ChallengeTrace
  graph(): { nodes: string[]; edges: Array<{ from: string; to: string; type: string }> }
}
