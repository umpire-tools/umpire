import type { RuleEvaluation } from './types.js'

export type CompositeConstraint = 'enabled' | 'fair'
export type CompositeMode = 'and' | 'or'

export function getCompositeFailureReasons(result: RuleEvaluation): string[] {
  if (result.reasons && result.reasons.length > 0) {
    return [...result.reasons]
  }

  if (result.reason !== null) {
    return [result.reason]
  }

  return []
}

export function combineCompositeResults(
  constraint: CompositeConstraint,
  mode: CompositeMode,
  results: RuleEvaluation[],
): RuleEvaluation {
  const passed =
    constraint === 'fair'
      ? mode === 'and'
        ? results.every((result) => result.fair !== false)
        : results.some((result) => result.fair !== false)
      : mode === 'and'
        ? results.every((result) => result.enabled)
        : results.some((result) => result.enabled)

  if (passed) {
    return constraint === 'fair'
      ? {
          enabled: true,
          fair: true,
          reason: null,
        }
      : {
          enabled: true,
          reason: null,
        }
  }

  const reasons = results.flatMap(getCompositeFailureReasons)

  return constraint === 'fair'
    ? {
        enabled: true,
        fair: false,
        reason: reasons[0] ?? null,
        reasons: reasons.length === 0 ? undefined : reasons,
      }
    : {
        enabled: false,
        reason: reasons[0] ?? null,
        reasons: reasons.length === 0 ? undefined : reasons,
      }
}

export function getCompositeTargetEvaluation(
  evaluation: Map<string, RuleEvaluation>,
  target: string,
): RuleEvaluation {
  return evaluation.get(target) ?? { enabled: true, reason: null }
}
