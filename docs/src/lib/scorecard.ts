import { foulMap, isSatisfied } from '@umpire/core'
import type {
  AvailabilityMap,
  ChallengeTrace,
  FieldDef,
  Foul,
  Snapshot,
  Umpire,
} from '@umpire/core'

type FieldReads<F extends Record<string, FieldDef>> = Partial<
  Record<keyof F & string, Record<string, unknown> | undefined>
>
type InspectFieldDefs<F extends Record<string, FieldDef>> = Partial<Record<keyof F & string, FieldDef>>

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
  changed: boolean
  cascaded: boolean
  foul: Foul<F> | null
  incoming: Array<{ field: string; type: string }>
  outgoing: Array<{ field: string; type: string }>
  trace?: ChallengeTrace
  reads?: Record<string, unknown>
}

export type ScorecardResult<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  Reads,
> = {
  check: AvailabilityMap<F>
  graph: ReturnType<Umpire<F, C>['graph']>
  fields: Record<keyof F & string, ScorecardField<F>>
  reads: Reads | undefined
  transition: {
    before: Snapshot<F, C> | null
    changedFields: Array<keyof F & string>
    fouls: Foul<F>[]
    foulsByField: Partial<Record<keyof F & string, Foul<F>>>
    fouledFields: Array<keyof F & string>
    directlyFouledFields: Array<keyof F & string>
    cascadingFields: Array<keyof F & string>
  }
}

function getChangedFields<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  fieldNames: Array<keyof F & string>,
  before: Snapshot<F, C> | undefined,
  after: Snapshot<F, C>,
) {
  if (!before) {
    return []
  }

  return fieldNames.filter((field) => !Object.is(before.values[field], after.values[field]))
}

function isPresent(value: unknown) {
  return value !== null && value !== undefined
}

export function scorecard<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  Reads = undefined,
>(
  ump: Umpire<F, C>,
  snapshot: Snapshot<F, C>,
  options: {
    before?: Snapshot<F, C>
    reads?: Reads
    fieldReads?: FieldReads<F>
    fields?: InspectFieldDefs<F>
    includeChallenge?: boolean
  } = {},
): ScorecardResult<F, C, Reads> {
  const {
    before,
    reads,
    fieldReads,
    fields: fieldDefs,
    includeChallenge = false,
  } = options
  const check = ump.check(snapshot.values, snapshot.conditions, before?.values)
  const graph = ump.graph()
  const fieldNames = graph.nodes as Array<keyof F & string>
  const changedFields = getChangedFields(fieldNames, before, snapshot)
  const fouls = before ? ump.play(before, snapshot) : []
  const foulsByField = foulMap(fouls)
  const changedFieldSet = new Set(changedFields)
  const fouledFields = fouls.map((foul) => foul.field)
  const directlyFouledFields = fouledFields.filter((field) => changedFieldSet.has(field))
  const cascadingFields = fouledFields
    .filter((field) => !changedFieldSet.has(field))
  const cascadingFieldSet = new Set(cascadingFields)

  const incomingByField = Object.fromEntries(
    fieldNames.map((field) => [
      field,
      graph.edges
        .filter((edge) => edge.to === field)
        .map((edge) => ({ field: edge.from, type: edge.type })),
    ]),
  ) as Record<keyof F & string, Array<{ field: string; type: string }>>

  const outgoingByField = Object.fromEntries(
    fieldNames.map((field) => [
      field,
      graph.edges
        .filter((edge) => edge.from === field)
        .map((edge) => ({ field: edge.to, type: edge.type })),
    ]),
  ) as Record<keyof F & string, Array<{ field: string; type: string }>>

  const fields = Object.fromEntries(
    fieldNames.map((field) => {
      const availability = check[field]
      const value = snapshot.values[field]
      const present = isPresent(value)
      const satisfied = isSatisfied(value, fieldDefs?.[field])

      return [
        field,
        {
          field,
          value,
          present,
          satisfied,
          enabled: availability.enabled,
          fair: availability.fair,
          required: availability.required,
          reason: availability.reason,
          reasons: availability.reasons,
          changed: changedFieldSet.has(field),
          cascaded: cascadingFieldSet.has(field),
          foul: foulsByField[field] ?? null,
          incoming: incomingByField[field],
          outgoing: outgoingByField[field],
          trace: includeChallenge
            ? ump.challenge(field, snapshot.values, snapshot.conditions, before?.values)
            : undefined,
          reads: fieldReads?.[field],
        },
      ]
    }),
  ) as Record<keyof F & string, ScorecardField<F>>

  return {
    check,
    graph,
    fields,
    reads,
    transition: {
      before: before ?? null,
      changedFields,
      fouls,
      foulsByField,
      fouledFields,
      directlyFouledFields,
      cascadingFields,
    },
  }
}
