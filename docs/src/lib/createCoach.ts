import type { FieldDef, Snapshot, Umpire } from '@umpire/core'
import type { FactTable, FactTableInspection } from './createFactTable.ts'
import { scorecard, type ScorecardResult } from './scorecard.ts'

type CoachFieldFacts<F extends Record<string, FieldDef>> = Partial<
  Record<keyof F & string, Record<string, unknown> | undefined>
>

export type CoachInspection<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  FactInput extends Record<string, unknown>,
  Facts extends Record<string, unknown>,
> = {
  factTable: FactTableInspection<FactInput, Facts>
  scorecard: ScorecardResult<F, C, Facts>
}

export type Coach<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  FactInput extends Record<string, unknown>,
  Facts extends Record<string, unknown>,
> = {
  inspect(
    snapshot: Snapshot<F, C>,
    options?: {
      before?: Snapshot<F, C>
      includeChallenge?: boolean
    },
  ): CoachInspection<F, C, FactInput, Facts>
}

export function createCoach<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  FactInput extends Record<string, unknown>,
  Facts extends Record<string, unknown>,
>(config: {
  describeField?: (field: keyof F & string, context: {
    factTable: FactTableInspection<FactInput, Facts>
    snapshot: Snapshot<F, C>
    before?: Snapshot<F, C>
  }) => Record<string, unknown> | undefined
  facts: FactTable<FactInput, Facts>
  fields?: Partial<Record<keyof F & string, FieldDef>>
  getFactInput: (snapshot: Snapshot<F, C>) => FactInput
  ump: Umpire<F, C>
}): Coach<F, C, FactInput, Facts> {
  const fieldNames = config.ump.graph().nodes as Array<keyof F & string>

  function buildFieldFacts(
    snapshot: Snapshot<F, C>,
    before: Snapshot<F, C> | undefined,
    factTable: FactTableInspection<FactInput, Facts>,
  ) {
    if (!config.describeField) {
      return undefined
    }

    return Object.fromEntries(
      fieldNames.map((field) => [
        field,
        config.describeField?.(field, {
          factTable,
          snapshot,
          before,
        }),
      ]),
    ) as CoachFieldFacts<F>
  }

  return {
    inspect(snapshot, options = {}) {
      const { before, includeChallenge = false } = options
      const factInput = config.getFactInput(snapshot)
      const factTable = config.facts.inspect(factInput)
      const fieldFacts = buildFieldFacts(snapshot, before, factTable)

      return {
        factTable,
        scorecard: scorecard(config.ump, snapshot, {
          before,
          facts: factTable.values,
          fieldFacts,
          fields: config.fields,
          includeChallenge,
        }),
      }
    },
  }
}
