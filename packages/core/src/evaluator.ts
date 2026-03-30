import { isSatisfied } from './satisfaction.js'
import { getInternalRuleMetadata, resolveReason } from './rules.js'
import type { AvailabilityMap, FieldDef, FieldValues, Rule, RuleEvaluation } from './types.js'

function getFailureReasons(result: RuleEvaluation): string[] {
  if (result.reasons && result.reasons.length > 0) {
    return [...result.reasons]
  }

  if (result.reason !== null) {
    return [result.reason]
  }

  return []
}

function evaluateRuleForField<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rule: Rule<F, C>,
  field: keyof F & string,
  fields: F,
  values: FieldValues<F>,
  context: C,
  prev: FieldValues<F> | undefined,
  availability: Partial<AvailabilityMap<F>>,
  baseRuleCache: Map<Rule<F, C>, Map<string, RuleEvaluation>>,
): RuleEvaluation {
  const metadata = getInternalRuleMetadata(rule)

  if (metadata?.kind === 'anyOf') {
    const innerResults = metadata.rules.map((innerRule) =>
      evaluateRuleForField(
        innerRule,
        field,
        fields,
        values,
        context,
        prev,
        availability,
        baseRuleCache,
      ),
    )

    if (innerResults.some((result) => result.enabled)) {
      return { enabled: true, reason: null }
    }

    const reasons = innerResults.flatMap(getFailureReasons)
    return {
      enabled: false,
      reason: reasons[0] ?? null,
      reasons: reasons.length === 0 ? undefined : reasons,
    }
  }

  if (metadata?.kind === 'requires') {
    const reasons = metadata.dependencies.flatMap((dependency) => {
      if (typeof dependency !== 'string') {
        if (dependency(values, context)) {
          return []
        }

        return [
          resolveReason(metadata.options?.reason, values, context, 'required condition not met'),
        ]
      }

      const dependencySatisfied = isSatisfied(values[dependency], fields[dependency])
      const dependencyEnabled = availability[dependency]?.enabled ?? true

      if (dependencySatisfied && dependencyEnabled) {
        return []
      }

      return [resolveReason(metadata.options?.reason, values, context, `requires ${dependency}`)]
    })

    return {
      enabled: reasons.length === 0,
      reason: reasons[0] ?? null,
      reasons: reasons.length === 0 ? undefined : reasons,
    }
  }

  let evaluation = baseRuleCache.get(rule)
  if (!evaluation) {
    evaluation = rule.evaluate(values, context, prev, fields)
    baseRuleCache.set(rule, evaluation)
  }

  const result = evaluation.get(field)

  if (!result) {
    return { enabled: true, reason: null }
  }

  return {
    enabled: result.enabled,
    reason: result.reason,
    reasons: result.reasons && result.reasons.length > 0 ? [...result.reasons] : undefined,
  }
}

export function evaluate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  fields: F,
  rules: Rule<F, C>[],
  topoOrder: Array<keyof F & string>,
  values: FieldValues<F>,
  context: C,
  prev?: FieldValues<F>,
): AvailabilityMap<F> {
  const availability = {} as AvailabilityMap<F>
  const rulesByTarget = new Map<string, Rule<F, C>[]>()
  const baseRuleCache = new Map<Rule<F, C>, Map<string, RuleEvaluation>>()

  for (const rule of rules) {
    for (const target of rule.targets) {
      const targetRules = rulesByTarget.get(target)
      if (targetRules) {
        targetRules.push(rule)
        continue
      }

      rulesByTarget.set(target, [rule])
    }
  }

  for (const field of topoOrder) {
    const fieldRules = rulesByTarget.get(field) ?? []
    const reasons: string[] = []
    let enabled = true
    let reason: string | null = null

    for (const rule of fieldRules) {
      const result = evaluateRuleForField(
        rule,
        field,
        fields,
        values,
        context,
        prev,
        availability,
        baseRuleCache,
      )

      if (result.enabled) {
        continue
      }

      enabled = false

      if (reason === null) {
        reason = result.reason
      }

      reasons.push(...getFailureReasons(result))
    }

    availability[field] = {
      enabled,
      required: enabled ? fields[field].required ?? false : false,
      reason,
      reasons,
    }
  }

  return availability
}
