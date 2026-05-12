import { isSatisfied } from '@umpire/core'
import {
  appendCompositeFailureReasons,
  combineCompositeResults,
  getInternalRuleMetadata,
  isFairRule,
  indexRulesByTarget as coreIndexRulesByTarget,
} from '@umpire/core/internal'
import type { AvailabilityMap, FieldDef, FieldValues, Rule } from '@umpire/core'
import type { AnyRule, AsyncRule, RuleEvaluation } from './types.js'
import { toAsyncRule } from './guards.js'

export type RulePhaseBuckets<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  gateRules: AsyncRule<F, C>[]
  fairRules: AsyncRule<F, C>[]
}

const EMPTY_RULE_PHASE_BUCKETS: RulePhaseBuckets<
  Record<string, FieldDef>,
  Record<string, unknown>
> = Object.freeze({
  gateRules: [],
  fairRules: [],
})

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

function isAsyncFairRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: AsyncRule<F, C>): boolean {
  return isFairRule(rule as unknown as Rule<F, C>)
}

function partitionRulesByPhase<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rules: AsyncRule<F, C>[]): RulePhaseBuckets<F, C> {
  const gateRules: AsyncRule<F, C>[] = []
  const fairRules: AsyncRule<F, C>[] = []

  for (const rule of rules) {
    if (isAsyncFairRule(rule)) {
      fairRules.push(rule)
    } else {
      gateRules.push(rule)
    }
  }

  return { gateRules, fairRules }
}

function indexRulesByTarget<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rules: AsyncRule<F, C>[]): Map<string, AsyncRule<F, C>[]> {
  return coreIndexRulesByTarget(
    rules as unknown as Rule<F, C>[],
  ) as unknown as Map<string, AsyncRule<F, C>[]>
}

export function indexRulesByTargetPhase<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rulesByTarget: Map<string, AsyncRule<F, C>[]>,
): Map<string, RulePhaseBuckets<F, C>> {
  const result = new Map<string, RulePhaseBuckets<F, C>>()

  for (const [field, rules] of rulesByTarget) {
    result.set(field, partitionRulesByPhase(rules))
  }

  return result
}

async function evaluateAnyOfRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  innerRules: AnyRule<F, C>[],
  constraint: CompositeConstraint,
  field: keyof F & string,
  fields: F,
  values: FieldValues<F>,
  conditions: C,
  prev: FieldValues<F> | undefined,
  availability: Partial<AvailabilityMap<F>>,
  rulePromiseCache: Map<AsyncRule<F, C>, Promise<Map<string, RuleEvaluation>>>,
  signal: AbortSignal,
): Promise<RuleEvaluation> {
  const asyncRules = innerRules.map((r) => toAsyncRule(r))

  const results = await Promise.all(
    asyncRules.map((innerRule) =>
      evaluateRuleForTargetAsync(
        innerRule,
        field,
        fields,
        values,
        conditions,
        prev,
        availability,
        rulePromiseCache,
        signal,
      ),
    ),
  )

  let passed = false
  let reasons: string[] | undefined

  for (const result of results) {
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

async function evaluateRuleForFieldAsync<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rule: AsyncRule<F, C>,
  field: keyof F & string,
  fields: F,
  values: FieldValues<F>,
  conditions: C,
  prev: FieldValues<F> | undefined,
  availability: Partial<AvailabilityMap<F>>,
  rulePromiseCache: Map<AsyncRule<F, C>, Promise<Map<string, RuleEvaluation>>>,
  signal: AbortSignal,
): Promise<RuleEvaluation> {
  const metadata = getInternalRuleMetadata(rule as unknown as Rule<F, C>)

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
      rulePromiseCache,
      signal,
    )
  }

  if (metadata?.kind === 'eitherOf') {
    const branchNames = Object.keys(metadata.branches)
    const branchResults = await Promise.all(
      branchNames.map(async (branchName) => {
        const branchRules = metadata.branches[branchName]
        const asyncBranchRules = branchRules.map((r) => toAsyncRule(r))
        const innerResults = await Promise.all(
          asyncBranchRules.map((innerRule) =>
            evaluateRuleForTargetAsync(
              innerRule,
              field,
              fields,
              values,
              conditions,
              prev,
              availability,
              rulePromiseCache,
              signal,
            ),
          ),
        )

        return combineCompositeResults(
          metadata.constraint,
          'and',
          innerResults,
        ) as RuleEvaluation
      }),
    )

    return combineCompositeResults(
      metadata.constraint,
      'or',
      branchResults,
    ) as RuleEvaluation
  }

  let evaluationPromise = rulePromiseCache.get(rule)
  if (!evaluationPromise) {
    evaluationPromise = rule.evaluate(
      values,
      conditions,
      prev,
      fields,
      availability,
      signal,
    )
    rulePromiseCache.set(rule, evaluationPromise)
  }

  const evaluation = await evaluationPromise
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

async function evaluateRuleForTargetAsync<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rule: AsyncRule<F, C>,
  field: keyof F & string,
  fields: F,
  values: FieldValues<F>,
  conditions: C,
  prev: FieldValues<F> | undefined,
  availability: Partial<AvailabilityMap<F>>,
  rulePromiseCache: Map<AsyncRule<F, C>, Promise<Map<string, RuleEvaluation>>>,
  signal: AbortSignal,
): Promise<RuleEvaluation> {
  const metadata = getInternalRuleMetadata(rule as unknown as Rule<F, C>)

  if (metadata?.kind === rule.type && metadata.evaluateTarget) {
    return metadata.evaluateTarget(
      field,
      values,
      conditions,
      fields,
      availability,
    ) as RuleEvaluation
  }

  return evaluateRuleForFieldAsync(
    rule,
    field,
    fields,
    values,
    conditions,
    prev,
    availability,
    rulePromiseCache,
    signal,
  )
}

async function evaluateGateRulesForField<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  gateRules: AsyncRule<F, C>[],
  field: keyof F & string,
  fields: F,
  values: FieldValues<F>,
  conditions: C,
  prev: FieldValues<F> | undefined,
  availability: Partial<AvailabilityMap<F>>,
  rulePromiseCache: Map<AsyncRule<F, C>, Promise<Map<string, RuleEvaluation>>>,
  signal: AbortSignal,
): Promise<{ enabled: boolean; reason: string | null; reasons: string[] }> {
  const reasons: string[] = []
  let enabled = true
  let reason: string | null = null

  const results = await Promise.all(
    gateRules.map((rule) =>
      evaluateRuleForTargetAsync(
        rule,
        field,
        fields,
        values,
        conditions,
        prev,
        availability,
        rulePromiseCache,
        signal,
      ),
    ),
  )

  for (const result of results) {
    if (result.enabled) {
      continue
    }

    enabled = false

    if (reason === null) {
      reason = result.reason
    }

    appendCompositeFailureReasons(result, reasons)
  }

  return { enabled, reason, reasons }
}

async function evaluateFairRulesForField<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  fairRules: AsyncRule<F, C>[],
  field: keyof F & string,
  fields: F,
  values: FieldValues<F>,
  conditions: C,
  prev: FieldValues<F> | undefined,
  availability: Partial<AvailabilityMap<F>>,
  rulePromiseCache: Map<AsyncRule<F, C>, Promise<Map<string, RuleEvaluation>>>,
  signal: AbortSignal,
): Promise<{ fair: boolean; reason: string | null; reasons: string[] }> {
  const reasons: string[] = []
  let fair = true
  let reason: string | null = null

  const results = await Promise.all(
    fairRules.map((rule) =>
      evaluateRuleForTargetAsync(
        rule,
        field,
        fields,
        values,
        conditions,
        prev,
        availability,
        rulePromiseCache,
        signal,
      ),
    ),
  )

  for (const result of results) {
    if (result.fair !== false) {
      continue
    }

    fair = false

    if (reason === null) {
      reason = result.reason
    }

    appendCompositeFailureReasons(result, reasons)
  }

  return { fair, reason, reasons }
}

export async function evaluateAsync<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  fields: F,
  rules: AnyRule<F, C>[],
  topoOrder: Array<keyof F & string>,
  values: FieldValues<F>,
  conditions: C,
  signal: AbortSignal,
  prev?: FieldValues<F>,
  rulesByTarget?: Map<string, AnyRule<F, C>[]>,
  rulesByTargetPhase?: Map<string, RulePhaseBuckets<F, C>>,
): Promise<AvailabilityMap<F>> {
  signal.throwIfAborted()

  const normalizedRules = rules.map((r) => toAsyncRule(r))

  const availability = {} as AvailabilityMap<F>
  const rulePromiseCache = new Map<
    AsyncRule<F, C>,
    Promise<Map<string, RuleEvaluation>>
  >()
  const resolvedRulesByTarget =
    rulesByTarget && rulesByTarget.size > 0
      ? new Map(
          Array.from(rulesByTarget, ([field, fieldRules]) => [
            field,
            fieldRules.map((r) => toAsyncRule(r)),
          ]),
        )
      : indexRulesByTarget(normalizedRules)
  const resolvedRulesByTargetPhase =
    rulesByTargetPhase ?? indexRulesByTargetPhase(resolvedRulesByTarget)

  for (const field of topoOrder) {
    signal.throwIfAborted()

    const { gateRules, fairRules } =
      resolvedRulesByTargetPhase.get(field) ?? EMPTY_RULE_PHASE_BUCKETS

    let enabled = true
    let fair = true
    let reason: string | null = null
    const reasons: string[] = []

    if (gateRules.length > 0) {
      const gateResult = await evaluateGateRulesForField(
        gateRules,
        field,
        fields,
        values,
        conditions,
        prev,
        availability,
        rulePromiseCache,
        signal,
      )
      enabled = gateResult.enabled
      if (gateResult.reason !== null) reason = gateResult.reason
      reasons.push(...gateResult.reasons)
    }

    if (enabled && fairRules.length > 0) {
      const fairResult = await evaluateFairRulesForField(
        fairRules,
        field,
        fields,
        values,
        conditions,
        prev,
        availability,
        rulePromiseCache,
        signal,
      )
      fair = fairResult.fair
      if (reason === null && fairResult.reason !== null)
        reason = fairResult.reason
      reasons.push(...fairResult.reasons)
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
