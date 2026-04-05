import type {
  FieldDef,
  ScorecardOptions,
  ScorecardResult,
  Snapshot,
  Umpire,
} from './types.js'

export function scorecard<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  snapshot: Snapshot<F, C>,
  options?: ScorecardOptions<F, C>,
): ScorecardResult<F, C> {
  return ump.scorecard(snapshot, options)
}
