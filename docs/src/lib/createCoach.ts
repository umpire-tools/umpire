import { scorecard, type FieldDef, type ScorecardResult, type Snapshot, type Umpire } from '@umpire/core'
import type { ReadTable, ReadTableInspection } from './createReadTable.ts'

export type CoachInspection<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  ReadInput extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
> = {
  reads: ReadTableInspection<ReadInput, Reads>
  scorecard: ScorecardResult<F, C>
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
  getReadInput: (snapshot: Snapshot<F, C>) => ReadInput
  reads: ReadTable<ReadInput, Reads>
  ump: Umpire<F, C>
}): Coach<F, C, ReadInput, Reads> {
  return {
    inspect(snapshot, options = {}) {
      const { before, includeChallenge = false } = options
      const readInput = config.getReadInput(snapshot)
      const readTable = config.reads.inspect(readInput)

      return {
        reads: readTable,
        scorecard: scorecard(config.ump, snapshot, {
          before,
          includeChallenge,
        }),
      }
    },
  }
}
