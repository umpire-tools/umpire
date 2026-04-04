import { foulMap } from '@umpire/core'
import type {
  AvailabilityMap,
  ChallengeTrace,
  FieldDef,
  Foul,
  Snapshot,
  Umpire,
} from '@umpire/core'

type FieldFacts<F extends Record<string, FieldDef>> = Partial<
  Record<keyof F & string, Record<string, unknown> | undefined>
>

export type InspectUmpreField<F extends Record<string, FieldDef>> = {
  field: keyof F & string
  value: unknown
  hasValue: boolean
  enabled: boolean
  required: boolean
  reason: string | null
  reasons: string[]
  foul: Foul<F> | null
  incoming: Array<{ field: string; type: string }>
  outgoing: Array<{ field: string; type: string }>
  trace: ChallengeTrace
  facts?: Record<string, unknown>
}

export type InspectUmpreResult<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  Facts,
> = {
  check: AvailabilityMap<F>
  graph: ReturnType<Umpire<F, C>['graph']>
  fields: Record<keyof F & string, InspectUmpreField<F>>
  facts: Facts | undefined
  transition: {
    before: Snapshot<F, C> | null
    changedFields: Array<keyof F & string>
    fouls: Foul<F>[]
    foulsByField: Partial<Record<keyof F & string, Foul<F>>>
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

function hasValue(value: unknown) {
  return value !== null && value !== undefined
}

export function inspectUmpre<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  Facts = undefined,
>(
  ump: Umpire<F, C>,
  snapshot: Snapshot<F, C>,
  options: {
    before?: Snapshot<F, C>
    facts?: Facts
    fieldFacts?: FieldFacts<F>
  } = {},
): InspectUmpreResult<F, C, Facts> {
  const { before, facts, fieldFacts } = options
  const check = ump.check(snapshot.values, snapshot.conditions, before?.values)
  const graph = ump.graph()
  const fieldNames = graph.nodes as Array<keyof F & string>
  const changedFields = getChangedFields(fieldNames, before, snapshot)
  const fouls = before ? ump.play(before, snapshot) : []
  const foulsByField = foulMap(fouls)
  const changedFieldSet = new Set(changedFields)
  const cascadingFields = fouls
    .map((foul) => foul.field)
    .filter((field) => !changedFieldSet.has(field))

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

      return [
        field,
        {
          field,
          value,
          hasValue: hasValue(value),
          enabled: availability.enabled,
          required: availability.required,
          reason: availability.reason,
          reasons: availability.reasons,
          foul: foulsByField[field] ?? null,
          incoming: incomingByField[field],
          outgoing: outgoingByField[field],
          trace: ump.challenge(field, snapshot.values, snapshot.conditions, before?.values),
          facts: fieldFacts?.[field],
        },
      ]
    }),
  ) as Record<keyof F & string, InspectUmpreField<F>>

  return {
    check,
    graph,
    fields,
    facts,
    transition: {
      before: before ?? null,
      changedFields,
      fouls,
      foulsByField,
      cascadingFields,
    },
  }
}
