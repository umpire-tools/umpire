import type {
  AnyRule,
  AsyncRule,
  AsyncSafeParseValidator,
  RuleEvaluation,
} from './types.js'
import type { FieldDef, FieldValues, AvailabilityMap } from '@umpire/core'

export function isAsyncSafeParseValidator<T = unknown>(
  validator: unknown,
): validator is AsyncSafeParseValidator<T> {
  return (
    typeof validator === 'object' &&
    validator !== null &&
    typeof (validator as Record<string, unknown>).safeParseAsync === 'function'
  )
}

export function isAsyncRule(
  rule: unknown,
): rule is AsyncRule<Record<string, FieldDef>, Record<string, unknown>> {
  return (
    typeof rule === 'object' &&
    rule !== null &&
    (rule as Record<string, unknown>).__async === true
  )
}

export function toAsyncRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: AnyRule<F, C>): AsyncRule<F, C> {
  if (isAsyncRule(rule)) return rule
  return {
    __async: true as const,
    type: rule.type,
    targets: rule.targets,
    sources: rule.sources,
    evaluate(
      values: FieldValues<F>,
      conditions: C,
      prev: FieldValues<F> | undefined,
      fields: F,
      availability: Partial<AvailabilityMap<F>>,
      _signal: AbortSignal,
    ): Promise<Map<string, RuleEvaluation>> {
      return Promise.resolve(
        rule.evaluate(values, conditions, prev, fields, availability),
      )
    },
  }
}
