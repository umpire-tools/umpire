import type {
  FieldDef,
  InputValues,
  ScorecardResult,
  Snapshot,
  Umpire,
} from '@umpire/core'
import type { ReadTable, ReadTableInspection } from '@umpire/reads'

export type DevtoolsBuiltinTab = 'matrix' | 'conditions' | 'fouls' | 'graph'
export type DevtoolsTab = DevtoolsBuiltinTab | 'reads' | (string & {})

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

export type DevtoolsExtensionTone = 'accent' | 'enabled' | 'disabled' | 'fair' | 'muted'

export type DevtoolsExtensionRow = {
  label: string
  value: unknown
}

export type DevtoolsExtensionBadge = {
  tone?: DevtoolsExtensionTone
  value: unknown
}

export type DevtoolsExtensionSection =
  | {
      kind: 'badges'
      title?: string
      badges: DevtoolsExtensionBadge[]
    }
  | {
      kind: 'rows'
      title?: string
      rows: DevtoolsExtensionRow[]
    }
  | {
      kind: 'items'
      title?: string
      items: Array<{
        id: string
        title: string
        badge?: DevtoolsExtensionBadge
        body?: string
        rows?: DevtoolsExtensionRow[]
      }>
    }

export type DevtoolsExtensionView = {
  empty?: string
  sections: DevtoolsExtensionSection[]
}

export type DevtoolsExtensionInspectContext<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  conditions?: C
  previous: Snapshot<C> | null
  scorecard: ScorecardResult<F, C>
  ump: Umpire<F, C>
  values: InputValues
}

export type DevtoolsExtension<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  id: string
  label?: string
  inspect(
    context: DevtoolsExtensionInspectContext<F, C>,
  ): DevtoolsExtensionView | null
}

export type RegisterOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  ReadInput extends Record<string, unknown> = Record<string, unknown>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
> = {
  extensions?: DevtoolsExtension<F, C>[]
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

export type AnySnapshot = Snapshot<Record<string, unknown>>
export type AnyScorecard = ScorecardResult<Record<string, FieldDef>, Record<string, unknown>>
export type AnyUmpire = Umpire<Record<string, FieldDef>, Record<string, unknown>>
export type AnyReadInspection = ReadTableInspection<Record<string, unknown>, Record<string, unknown>>
export type AnyDevtoolsExtension = DevtoolsExtension<Record<string, FieldDef>, Record<string, unknown>>

export type ResolvedDevtoolsExtension = {
  id: string
  label: string
  view: DevtoolsExtensionView
}

export type RegistryEntry = {
  extensions: ResolvedDevtoolsExtension[]
  foulLog: DevtoolsFoulEvent[]
  id: string
  optionExtensions?: unknown
  optionReadInput?: unknown
  optionReads?: unknown
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
  ReadInput extends Record<string, unknown> = InputValues,
  Reads extends Record<string, unknown> = Record<string, unknown>,
>(
  id: string,
  ump: Umpire<F, C>,
  values: InputValues,
  conditions?: C,
  options?: RegisterOptions<F, C, ReadInput, Reads>,
) => void
