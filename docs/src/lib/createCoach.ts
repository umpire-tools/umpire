import type { FieldDef, Snapshot, Umpire } from '@umpire/core'
import type { ReadTable, ReadTableInspection } from './createReadTable.ts'
import { scorecard, type ScorecardResult } from './scorecard.ts'

type CoachFieldReads<F extends Record<string, FieldDef>> = Partial<
  Record<keyof F & string, Record<string, unknown> | undefined>
>

export type CoachInspection<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  ReadInput extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
> = {
  reads: ReadTableInspection<ReadInput, Reads>
  scorecard: ScorecardResult<F, C, Reads>
}

export type Coach<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  ReadInput extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
> = {
  inspect(
    snapshot: Snapshot<F, C>,
    options?: {
      before?: Snapshot<F, C>
      includeChallenge?: boolean
    },
  ): CoachInspection<F, C, ReadInput, Reads>
}

export function createCoach<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  ReadInput extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
>(config: {
  describeField?: (field: keyof F & string, context: {
    readTable: ReadTableInspection<ReadInput, Reads>
    snapshot: Snapshot<F, C>
    before?: Snapshot<F, C>
  }) => Record<string, unknown> | undefined
  fields?: Partial<Record<keyof F & string, FieldDef>>
  getReadInput: (snapshot: Snapshot<F, C>) => ReadInput
  reads: ReadTable<ReadInput, Reads>
  ump: Umpire<F, C>
}): Coach<F, C, ReadInput, Reads> {
  const fieldNames = config.ump.graph().nodes as Array<keyof F & string>

  function buildFieldReads(
    snapshot: Snapshot<F, C>,
    before: Snapshot<F, C> | undefined,
    readTable: ReadTableInspection<ReadInput, Reads>,
  ) {
    if (!config.describeField) {
      return undefined
    }

    return Object.fromEntries(
      fieldNames.map((field) => [
        field,
        config.describeField?.(field, {
          readTable,
          snapshot,
          before,
        }),
      ]),
    ) as CoachFieldReads<F>
  }

  return {
    inspect(snapshot, options = {}) {
      const { before, includeChallenge = false } = options
      const readInput = config.getReadInput(snapshot)
      const readTable = config.reads.inspect(readInput)
      const fieldReads = buildFieldReads(snapshot, before, readTable)

      return {
        reads: readTable,
        scorecard: scorecard(config.ump, snapshot, {
          before,
          reads: readTable.values,
          fieldReads,
          fields: config.fields,
          includeChallenge,
        }),
      }
    },
  }
}
