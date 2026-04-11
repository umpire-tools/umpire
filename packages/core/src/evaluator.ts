import {
  combineCompositeResults,
  getCompositeFailureReasons,
} from './composite.js'
import { isSatisfied } from './satisfaction.js'
import { getInternalRuleMetadata, isFairRule, isGateRule, resolveReason } from './rules.js'
import type { AvailabilityMap, FieldDef, FieldValues, Rule, RuleEvaluation } from './types.js'

function partitionRulesByPhase<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rules: Rule<F, C>[]) {
  const gateRules: Rule<F, C>[] = []
  const fairRules: Rule<F, C>[] = []

  for (const rule of rules) {
    if (isFairRule(rule)) {
      fairRules.push(rule)
      continue
    }

    if (isGateRule(rule)) {
      gateRules.push(rule)
    }
  }

  return {
    gateRules,
    fairRules,
  }
}

export function indexRulesByTarget<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rules: Rule<F, C>[]): Map<string, Rule<F, C>[]> {
  const rulesByTarget = new Map<string, Rule<F, C>[]>()

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

  return rulesByTarget
}

export function evaluateRuleForField<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rule: Rule<F, C>,
  field: keyof F & string,
  fields: F,
  values: FieldValues<F>,
  conditions: C,
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
        conditions,
        prev,
        availability,
        baseRuleCache,
      ),
    )

    return combineCompositeResults(metadata.constraint, 'or', innerResults)
  }

  if (metadata?.kind === 'eitherOf') {
    const branchResults = Object.values(metadata.branches).map((branchRules) =>
      combineCompositeResults(
        metadata.constraint,
        'and',
        branchRules.map((innerRule) =>
          evaluateRuleForField(
            innerRule,
            field,
            fields,
            values,
            conditions,
            prev,
            availability,
            baseRuleCache,
          )),
      ),
    )

    return combineCompositeResults(metadata.constraint, 'or', branchResults)
  }

  if (metadata?.kind === 'requires') {
    const reasons = metadata.dependencies.flatMap((dependency) => {
      if (typeof dependency !== 'string') {
        if (dependency(values, conditions)) {
          return []
        }

        return [
          resolveReason(metadata.options?.reason, values, conditions, 'required condition not met'),
        ]
      }

      const dependencySatisfied = isSatisfied(values[dependency], fields[dependency])
      const dependencyEnabled = availability[dependency]?.enabled ?? true
      const dependencyFair = availability[dependency]?.fair ?? true

      if (dependencySatisfied && dependencyEnabled && dependencyFair) {
        return []
      }

      return [
        resolveReason(metadata.options?.reason, values, conditions, `requires ${dependency}`),
      ]
    })

    return {
      enabled: reasons.length === 0,
      reason: reasons[0] ?? null,
      reasons: reasons.length === 0 ? undefined : reasons,
    }
  }

  let evaluation = baseRuleCache.get(rule)
  if (!evaluation) {
    evaluation = rule.evaluate(values, conditions, prev, fields, availability)
    baseRuleCache.set(rule, evaluation)
  }

  const result = evaluation.get(field)

  if (!result) {
    return { enabled: true, reason: null }
  }

  return {
    enabled: result.enabled,
    fair: result.fair,
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
  conditions: C,
  prev?: FieldValues<F>,
  rulesByTarget?: Map<string, Rule<F, C>[]>,
): AvailabilityMap<F> {
  const availability = {} as AvailabilityMap<F>
  const baseRuleCache = new Map<Rule<F, C>, Map<string, RuleEvaluation>>()
  const resolvedRulesByTarget = rulesByTarget ?? indexRulesByTarget(rules)

  for (const field of topoOrder) {
    const fieldRules = resolvedRulesByTarget.get(field) ?? []
    const { gateRules, fairRules } = partitionRulesByPhase(fieldRules)
    const reasons: string[] = []
    let enabled = true
    let fair = true
    let reason: string | null = null

    for (const rule of gateRules) {
      const result = evaluateRuleForField(
        rule,
        field,
        fields,
        values,
        conditions,
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

      reasons.push(...getCompositeFailureReasons(result))
    }

    if (enabled) {
      for (const rule of fairRules) {
        const result = evaluateRuleForField(
          rule,
          field,
          fields,
          values,
          conditions,
          prev,
          availability,
          baseRuleCache,
        )

        if (result.fair !== false) {
          continue
        }

        fair = false

        if (reason === null) {
          reason = result.reason
        }

        reasons.push(...getCompositeFailureReasons(result))
      }
    }

    availability[field] = {
      enabled,
      fair,
      required: enabled ? fields[field].required ?? false : false,
      reason,
      reasons,
    }
  }

  return availability
}
