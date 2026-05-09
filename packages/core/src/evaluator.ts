import {
  appendCompositeFailureReasons,
  combineCompositeResults,
} from './composite.js'
import { getInternalRuleMetadata, isFairRule } from './rules.js'
import { isSatisfied } from './satisfaction.js'
import type {
  AvailabilityMap,
  FieldDef,
  FieldValues,
  Rule,
  RuleEvaluation,
} from './types.js'

type RulePhaseBuckets<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  gateRules: Rule<F, C>[]
  fairRules: Rule<F, C>[]
}

const EMPTY_RULE_PHASE_BUCKETS = {
  gateRules: [],
  fairRules: [],
} as const

const DEFAULT_RULE_EVALUATION: RuleEvaluation = Object.freeze({
  enabled: true,
  reason: null,
})

type CompositeConstraint = 'enabled' | 'fair'

function isCompositePassed(
  constraint: CompositeConstraint,
  result: RuleEvaluation,
): boolean {
  return constraint === 'fair' ? result.fair !== false : result.enabled
}

function createCompositePassResult(
  constraint: CompositeConstraint,
): RuleEvaluation {
  if (constraint === 'fair') {
    return {
      enabled: true,
      fair: true,
      reason: null,
    }
  }

  return {
    enabled: true,
    reason: null,
  }
}

function createCompositeFailureResult(
  constraint: CompositeConstraint,
  reasons: string[] | undefined,
): RuleEvaluation {
  const normalizedReasons = reasons && reasons.length > 0 ? reasons : undefined

  if (constraint === 'fair') {
    return {
      enabled: true,
      fair: false,
      reason: normalizedReasons?.[0] ?? null,
      reasons: normalizedReasons,
    }
  }

  return {
    enabled: false,
    reason: normalizedReasons?.[0] ?? null,
    reasons: normalizedReasons,
  }
}

function evaluateAnyOfRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rules: Rule<F, C>[],
  constraint: CompositeConstraint,
  field: keyof F & string,
  fields: F,
  values: FieldValues<F>,
  conditions: C,
  prev: FieldValues<F> | undefined,
  availability: Partial<AvailabilityMap<F>>,
  baseRuleCache: Map<Rule<F, C>, Map<string, RuleEvaluation>>,
): RuleEvaluation {
  let passed = false
  let reasons: string[] | undefined

  for (const innerRule of rules) {
    const result = evaluateRuleForField(
      innerRule,
      field,
      fields,
      values,
      conditions,
      prev,
      availability,
      baseRuleCache,
    )

    if (isCompositePassed(constraint, result)) {
      passed = true
      reasons = undefined
      continue
    }

    if (!passed) {
      reasons ??= []
      appendCompositeFailureReasons(result, reasons)
    }
  }

  return passed
    ? createCompositePassResult(constraint)
    : createCompositeFailureResult(constraint, reasons)
}

function partitionRulesByPhase<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rules: Rule<F, C>[]): RulePhaseBuckets<F, C> {
  const gateRules: Rule<F, C>[] = []
  const fairRules: Rule<F, C>[] = []

  for (const rule of rules) {
    if (isFairRule(rule)) {
      fairRules.push(rule)
      continue
    }

    gateRules.push(rule)
  }

  return {
    gateRules,
    fairRules,
  }
}

export function indexRulesByTargetPhase<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rulesByTarget: Map<string, Rule<F, C>[]>,
): Map<string, RulePhaseBuckets<F, C>> {
  const rulesByTargetPhase = new Map<string, RulePhaseBuckets<F, C>>()

  for (const [field, rules] of rulesByTarget) {
    rulesByTargetPhase.set(field, partitionRulesByPhase(rules))
  }

  return rulesByTargetPhase
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

  // Stryker disable ConditionalExpression,BlockStatement,StringLiteral: equivalent mutant — anyOf/eitherOf implement their own evaluate() that mirrors these paths exactly; bypassing the metadata branch produces identical results; 'or'→'' is equivalent because '' falls through to the OR branch in combineCompositeResults
  if (metadata?.kind === 'anyOf') {
    return evaluateAnyOfRule(
      metadata.rules,
      metadata.constraint,
      field,
      fields,
      values,
      conditions,
      prev,
      availability,
      baseRuleCache,
    )
  }

  if (metadata?.kind === 'eitherOf') {
    const branchResults: RuleEvaluation[] = []

    for (const branchRules of Object.values(metadata.branches)) {
      const innerResults: RuleEvaluation[] = []

      for (const innerRule of branchRules) {
        innerResults.push(
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
      }

      branchResults.push(
        combineCompositeResults(metadata.constraint, 'and', innerResults),
      )
    }

    return combineCompositeResults(metadata.constraint, 'or', branchResults)
  }
  // Stryker enable ConditionalExpression,BlockStatement,StringLiteral

  let evaluation = baseRuleCache.get(rule)
  if (!evaluation) {
    evaluation = rule.evaluate(values, conditions, prev, fields, availability)
    baseRuleCache.set(rule, evaluation)
  }

  const result = evaluation.get(field)

  if (!result) {
    return DEFAULT_RULE_EVALUATION
  }

  if (!result.reasons || result.reasons.length > 0) {
    return result
  }

  return {
    enabled: result.enabled,
    fair: result.fair,
    reason: result.reason,
    reasons: undefined,
  }
}

function evaluateRuleForTarget<
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

  if (metadata?.kind === rule.type && metadata.evaluateTarget) {
    return metadata.evaluateTarget(
      field,
      values,
      conditions,
      fields,
      availability,
    )
  }

  return evaluateRuleForField(
    rule,
    field,
    fields,
    values,
    conditions,
    prev,
    availability,
    baseRuleCache,
  )
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
  rulesByTargetPhase?: Map<string, RulePhaseBuckets<F, C>>,
): AvailabilityMap<F> {
  const availability = {} as AvailabilityMap<F>
  const baseRuleCache = new Map<Rule<F, C>, Map<string, RuleEvaluation>>()
  const resolvedRulesByTarget = rulesByTarget ?? indexRulesByTarget(rules)
  const resolvedRulesByTargetPhase =
    rulesByTargetPhase ?? indexRulesByTargetPhase(resolvedRulesByTarget)

  for (const field of topoOrder) {
    const { gateRules, fairRules } =
      resolvedRulesByTargetPhase.get(field) ?? EMPTY_RULE_PHASE_BUCKETS
    const reasons: string[] = []
    let enabled = true
    let fair = true
    let reason: string | null = null

    for (const rule of gateRules) {
      const result = evaluateRuleForTarget(
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

      appendCompositeFailureReasons(result, reasons)
    }

    if (enabled) {
      for (const rule of fairRules) {
        const result = evaluateRuleForTarget(
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

        appendCompositeFailureReasons(result, reasons)
      }
    }

    availability[field] = {
      enabled,
      satisfied: isSatisfied(values[field], fields[field]),
      fair,
      required: enabled ? (fields[field].required ?? false) : false,
      reason,
      reasons,
    }
  }

  return availability
}
