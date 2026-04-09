import type {
  FieldDef,
  InputValues,
  ScorecardResult,
  Snapshot,
  Umpire,
} from '@umpire/core'
import type { ReadTable, ReadTableInspection } from '@umpire/reads'

export type DevtoolsTab = 'matrix' | 'conditions' | 'fouls' | 'graph' | 'reads'

export type DevtoolsPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left'

export type MountOptions = {
  position?: DevtoolsPosition
  offset?: {
    x: number
    y: number
  }
  foulLogDepth?: number
  defaultTab?: DevtoolsTab
}

export type RegisterOptions<
  ReadInput extends Record<string, unknown> = Record<string, unknown>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
> = {
  reads?: ReadTable<ReadInput, Reads> | ReadTableInspection<ReadInput, Reads>
  readInput?: ReadInput
}

export type DevtoolsFoulEvent = {
  field: string
  reason: string
  suggestedValue: unknown
  cascaded: boolean
  renderIndex: number
  timestamp: number
}

export type AnySnapshot = Snapshot<Record<string, FieldDef>, Record<string, unknown>>
export type AnyScorecard = ScorecardResult<Record<string, FieldDef>, Record<string, unknown>>
export type AnyUmpire = Umpire<Record<string, FieldDef>, Record<string, unknown>>
export type AnyReadInspection = ReadTableInspection<Record<string, unknown>, Record<string, unknown>>

export type RegistryEntry = {
  foulLog: DevtoolsFoulEvent[]
  id: string
  previous: AnySnapshot | null
  reads: AnyReadInspection | null
  renderIndex: number
  scorecard: AnyScorecard
  snapshot: AnySnapshot
  ump: AnyUmpire
  updatedAt: number
}

export type RegisterFn = <
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  ReadInput extends Record<string, unknown> = InputValues<F>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
>(
  id: string,
  ump: Umpire<F, C>,
  values: InputValues<F>,
  conditions?: C,
  options?: RegisterOptions<ReadInput, Reads>,
) => void
