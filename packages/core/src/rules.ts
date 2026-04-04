import { getFieldBuilderName } from './field.js'
import { isSatisfied } from './satisfaction.js'
import type { FieldDef, FieldValues, Rule, RuleEvaluation } from './types.js'

type RuleResult = RuleEvaluation

type Predicate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = ((values: FieldValues<F>, conditions: C) => boolean) & {
  _checkField?: keyof F & string
}

type ReasonOption<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = string | ((values: FieldValues<F>, conditions: C) => string)

type RuleOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  reason?: ReasonOption<F, C>
}

type FieldSelector<
  F extends Record<string, FieldDef>,
  V = unknown,
> = (keyof F & string) | { readonly __umpfield: keyof F & string } | { readonly __umpfield: string }

type Source<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = (keyof F & string) | Predicate<F, C>

type FairPredicate<
  V,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = ((value: NonNullable<V>, values: FieldValues<F>, conditions: C) => boolean) & {
  _checkField?: keyof F & string
}

type OneOfBranches<F extends Record<string, FieldDef>> = Record<
  string,
  Array<keyof F & string>
>

type OneOfOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = RuleOptions<F, C> & {
  activeBranch?: string | ((values: FieldValues<F>, conditions: C) => string | null | undefined)
}

type FunctionValidator<V> = (value: V) => boolean
type SafeParseValidator<V> = { safeParse: (value: V) => { success: boolean } }
type StringTestValidator = { test: (value: string) => boolean }
type Validator<V> = FunctionValidator<V> | SafeParseValidator<V> | StringTestValidator

export type InternalPredicate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Predicate<F, C>

export type InternalSource<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Source<F, C>

export type InternalOneOfBranches<F extends Record<string, FieldDef>> = OneOfBranches<F>

export type InternalFairPredicate<
  V,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = FairPredicate<V, F, C>

export type InternalRuleMetadata<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> =
  | {
      kind: 'enabledWhen'
      predicate: Predicate<F, C>
      options?: RuleOptions<F, C>
    }
  | {
      kind: 'disables'
      source: Source<F, C>
      options?: RuleOptions<F, C>
    }
  | {
      kind: 'fairWhen'
      predicate: FairPredicate<unknown, F, C>
      options?: RuleOptions<F, C>
    }
  | {
      kind: 'requires'
      dependencies: Array<Source<F, C>>
      options?: RuleOptions<F, C>
    }
  | {
      kind: 'oneOf'
      groupName: string
      branches: OneOfBranches<F>
      options?: OneOfOptions<F, C>
    }
  | {
      kind: 'anyOf'
      rules: Rule<F, C>[]
      constraint: 'enabled' | 'fair'
    }

type InternalRuleCarrier<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Rule<F, C> & {
  _umpire?: InternalRuleMetadata<F, C>
}

export type OneOfResolution = {
  activeBranch: string | null
  method: string
  branches: Record<string, { fields: string[]; anySatisfied: boolean }>
}

export type GraphSourceInfo<F extends Record<string, FieldDef>> = {
  ordering: Array<keyof F & string>
  informational: Array<keyof F & string>
}

function createResultMap<F extends Record<string, FieldDef>>(
  targets: Array<keyof F & string>,
  resultForTarget: (target: keyof F & string) => RuleResult,
): Map<string, RuleEvaluation> {
  const results = new Map<string, RuleEvaluation>()

  for (const target of targets) {
    results.set(
      target,
      resultForTarget(target),
    )
  }

  return results
}

export function resolveReason<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  reason: ReasonOption<F, C> | undefined,
  values: FieldValues<F>,
  conditions: C,
  fallback: string,
): string {
  if (typeof reason === 'function') {
    return reason(values, conditions)
  }

  return reason ?? fallback
}

function getCheckField<F extends Record<string, FieldDef>, C extends Record<string, unknown>>(
  source: Predicate<F, C>,
): (keyof F & string) | undefined {
  return source._checkField
}

function getFairCheckField<
  V,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  predicate: FairPredicate<V, F, C>,
): (keyof F & string) | undefined {
  return predicate._checkField
}

function getFieldNameOrThrow<
  F extends Record<string, FieldDef>,
  V,
>(
  field: FieldSelector<F, V>,
): keyof F & string {
  if (typeof field === 'string') {
    return field
  }

  const name = getFieldBuilderName(field)
  if (!name) {
    throw new Error('[umpire] Named field builder required when passing a field() value to a rule')
  }

  return name as keyof F & string
}

export function getSourceField<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  source: InternalSource<F, C>,
): (keyof F & string) | undefined {
  if (typeof source === 'string') {
    return source
  }

  return getCheckField(source)
}

export function getInternalRuleMetadata<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: Rule<F, C>): InternalRuleMetadata<F, C> | undefined {
  return (rule as InternalRuleCarrier<F, C>)._umpire
}

export function getGraphSourceInfo<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: Rule<F, C>): GraphSourceInfo<F> {
  const metadata = getInternalRuleMetadata(rule)

  if (metadata?.kind === 'enabledWhen') {
    return {
      ordering: [],
      informational: getSourceFields(metadata.predicate),
    }
  }

  if (metadata?.kind === 'fairWhen') {
    const source = getFairCheckField(metadata.predicate)

    return {
      ordering: [],
      informational: source ? [source] : [],
    }
  }

  if (metadata?.kind === 'anyOf') {
    const ordering = uniqueFields(
      metadata.rules.flatMap((innerRule) => getGraphSourceInfo(innerRule).ordering),
    )
    const orderingSet = new Set(ordering)
    const informational = uniqueFields(
      metadata.rules
        .flatMap((innerRule) => getGraphSourceInfo(innerRule).informational)
        .filter((field) => !orderingSet.has(field)),
    )

    return {
      ordering,
      informational,
    }
  }

  return {
    ordering: [...rule.sources],
    informational: [],
  }
}

function getSourceFields<F extends Record<string, FieldDef>, C extends Record<string, unknown>>(
  source: InternalSource<F, C>,
): Array<keyof F & string> {
  const checkField = getSourceField(source)
  return checkField ? [checkField] : []
}

function getFairSourceFields<
  V,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  predicate: FairPredicate<V, F, C>,
): Array<keyof F & string> {
  const checkField = getFairCheckField(predicate)
  return checkField ? [checkField] : []
}

function getSourceLabel<F extends Record<string, FieldDef>, C extends Record<string, unknown>>(
  source: Source<F, C>,
): string {
  if (typeof source === 'string') {
    return source
  }

  return getCheckField(source) ?? 'condition'
}

function isSourceActive<F extends Record<string, FieldDef>, C extends Record<string, unknown>>(
  source: Source<F, C>,
  values: FieldValues<F>,
  conditions: C,
  fields?: F,
): boolean {
  if (typeof source === 'string') {
    return isSatisfied(values[source], fields?.[source])
  }

  return source(values, conditions)
}

function isReasonOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(value: unknown): value is RuleOptions<F, C> {
  return typeof value === 'object' && value !== null && 'reason' in value
}

function uniqueFields<F extends Record<string, FieldDef>>(
  fields: Array<keyof F & string>,
): Array<keyof F & string> {
  return [...new Set(fields)]
}

function getRuleConstraint<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: Rule<F, C>): 'enabled' | 'fair' {
  const metadata = getInternalRuleMetadata(rule)

  if (metadata?.kind === 'fairWhen') {
    return 'fair'
  }

  if (metadata?.kind === 'anyOf') {
    return metadata.constraint
  }

  return 'enabled'
}

function branchHasSatisfiedField<F extends Record<string, FieldDef>>(
  branchFields: Array<keyof F & string>,
  values: FieldValues<F> | undefined,
  fields?: F,
): boolean {
  if (!values) {
    return false
  }

  return branchFields.some((field) => isSatisfied(values[field], fields?.[field]))
}

function shouldWarnInDev(): boolean {
  const processLike = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return processLike.process?.env?.NODE_ENV !== 'production'
}

function warnAmbiguousOneOf(groupName: string, branchNames: string[]): void {
  if (!shouldWarnInDev()) {
    return
  }

  console.warn(
    `oneOf("${groupName}") is ambiguous; falling back to the first satisfied branch (${branchNames[0]}).`,
  )
}

export function resolveOneOfState<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  groupName: string,
  branches: OneOfBranches<F>,
  values: FieldValues<F>,
  prev: FieldValues<F> | undefined,
  activeBranch: OneOfOptions<F, C>['activeBranch'],
  fields?: F,
  conditions?: C,
): OneOfResolution {
  const branchNames = Object.keys(branches)
  const branchStates = Object.fromEntries(
    branchNames.map((branchName) => [
      branchName,
      {
        fields: [...branches[branchName]],
        anySatisfied: branchHasSatisfiedField(branches[branchName], values, fields),
      },
    ]),
  ) as Record<string, { fields: string[]; anySatisfied: boolean }>

  if (typeof activeBranch === 'string') {
    return {
      activeBranch,
      method: 'explicit activeBranch',
      branches: branchStates,
    }
  }

  if (typeof activeBranch === 'function') {
    const resolvedBranch = activeBranch(values, conditions as C)
    if (resolvedBranch == null) {
      return {
        activeBranch: null,
        method: 'explicit activeBranch',
        branches: branchStates,
      }
    }
    if (!(resolvedBranch in branches)) {
      throw new Error(`[umpire] Unknown active branch "${resolvedBranch}" for oneOf("${groupName}")`)
    }
    return {
      activeBranch: resolvedBranch,
      method: 'explicit activeBranch',
      branches: branchStates,
    }
  }

  const satisfiedBranches = branchNames.filter((branchName) =>
    branchHasSatisfiedField(branches[branchName], values, fields),
  )

  if (satisfiedBranches.length === 0) {
    return {
      activeBranch: null,
      method: 'auto-detected',
      branches: branchStates,
    }
  }

  if (satisfiedBranches.length === 1) {
    return {
      activeBranch: satisfiedBranches[0],
      method: 'auto-detected',
      branches: branchStates,
    }
  }

  if (prev) {
    const previouslySatisfiedBranches = new Set(
      branchNames.filter((branchName) =>
        branchHasSatisfiedField(branches[branchName], prev, fields),
      ),
    )
    const newlySatisfiedBranches = satisfiedBranches.filter(
      (branchName) => !previouslySatisfiedBranches.has(branchName),
    )

    if (newlySatisfiedBranches.length === 1) {
      return {
        activeBranch: newlySatisfiedBranches[0],
        method: 'auto-detected from prev',
        branches: branchStates,
      }
    }

    if (newlySatisfiedBranches.length > 1) {
      warnAmbiguousOneOf(groupName, satisfiedBranches)
      return {
        activeBranch: satisfiedBranches[0],
        method: 'fallback: first branch',
        branches: branchStates,
      }
    }
  }

  warnAmbiguousOneOf(groupName, satisfiedBranches)
  return {
    activeBranch: satisfiedBranches[0],
    method: 'fallback: first branch',
    branches: branchStates,
  }
}

export function enabledWhen<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  V = unknown,
>(
  field: FieldSelector<F, V>,
  predicate: Predicate<F, C>,
  options?: RuleOptions<F, C>,
): Rule<F, C> {
  const target = getFieldNameOrThrow(field)

  const rule: InternalRuleCarrier<F, C> = {
    type: 'enabledWhen',
    targets: [target],
    sources: [],
    evaluate(values, conditions) {
      const passed = predicate(values, conditions)

      return createResultMap([target], () => ({
        enabled: passed,
        reason: passed
          ? null
          : resolveReason(options?.reason, values, conditions, 'condition not met'),
      }))
    },
  }

  rule._umpire = {
    kind: 'enabledWhen',
    predicate,
    options,
  }

  return rule
}

export function fairWhen<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  V = unknown,
>(
  field: FieldSelector<F, V>,
  predicate: FairPredicate<V, F, C>,
  options?: RuleOptions<F, C>,
): Rule<F, C> {
  const target = getFieldNameOrThrow(field)

  const rule: InternalRuleCarrier<F, C> = {
    type: 'fairWhen',
    targets: [target],
    sources: getFairSourceFields(predicate),
    evaluate(values, conditions, _prev, fields) {
      const value = values[target]

      if (!isSatisfied(value, fields?.[target])) {
        return createResultMap([target], () => ({
          enabled: true,
          fair: true,
          reason: null,
        }))
      }

      const passed = predicate(value as NonNullable<V>, values, conditions)

      return createResultMap([target], () => ({
        enabled: true,
        fair: passed,
        reason: passed
          ? null
          : resolveReason(
              options?.reason,
              values,
              conditions,
              'selection is no longer valid',
            ),
      }))
    },
  }

  rule._umpire = {
    kind: 'fairWhen',
    predicate: predicate as FairPredicate<unknown, F, C>,
    options,
  }

  return rule
}

export function disables<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  source: Source<F, C>,
  targets: Array<keyof F & string>,
  options?: RuleOptions<F, C>,
): Rule<F, C> {
  const defaultReason =
    typeof source === 'string'
      ? `overridden by ${source}`
      : `overridden by ${getSourceLabel(source)}`

  const rule: InternalRuleCarrier<F, C> = {
    type: 'disables',
    targets,
    sources: getSourceFields(source),
    evaluate(values, conditions, _prev, fields) {
      const active = isSourceActive(source, values, conditions, fields)

      return createResultMap(targets, () => ({
        enabled: !active,
        reason: active ? resolveReason(options?.reason, values, conditions, defaultReason) : null,
      }))
    },
  }

  rule._umpire = {
    kind: 'disables',
    source,
    options,
  }

  return rule
}

export function requires<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  V = unknown,
>(
  field: FieldSelector<F, V>,
  ...deps: Array<Source<F, C> | RuleOptions<F, C>>
): Rule<F, C> {
  const target = getFieldNameOrThrow(field)
  const maybeOptions = deps[deps.length - 1]
  const options = isReasonOptions<F, C>(maybeOptions) ? maybeOptions : undefined
  const dependencies = (options ? deps.slice(0, -1) : deps) as Array<Source<F, C>>

  if (dependencies.length === 0) {
    throw new Error(`[umpire] requires("${target}") requires at least one dependency`)
  }

  const rule: InternalRuleCarrier<F, C> = {
    type: 'requires',
    targets: [target],
    sources: uniqueFields(
      dependencies.flatMap((dependency) => getSourceFields(dependency)),
    ),
    evaluate(values, conditions, _prev, fields, availability) {
      const reasons = dependencies.flatMap((dependency) => {
        const passed =
          typeof dependency === 'string'
            ? isSatisfied(values[dependency], fields?.[dependency]) &&
              (availability?.[dependency]?.enabled ?? true) &&
              (availability?.[dependency]?.fair ?? true)
            : dependency(values, conditions)

        if (passed) {
          return []
        }

        const fallback =
          typeof dependency === 'string'
            ? `requires ${dependency}`
            : `required condition not met`

        return [resolveReason(options?.reason, values, conditions, fallback)]
      })

      return createResultMap([target], () => ({
        enabled: reasons.length === 0,
        reason: reasons[0] ?? null,
        reasons: reasons.length === 0 ? undefined : reasons,
      }))
    },
  }

  rule._umpire = {
    kind: 'requires',
    dependencies,
    options,
  }

  return rule
}

export function oneOf<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  groupName: string,
  branches: OneOfBranches<F>,
  options?: OneOfOptions<F, C>,
): Rule<F, C> {
  const seenFields = new Set<string>()
  const branchNames = Object.keys(branches)

  if (branchNames.length === 0) {
    throw new Error(`[umpire] oneOf("${groupName}") must include at least one branch`)
  }

  for (const branchName of branchNames) {
    const fields = branches[branchName]

    if (fields.length === 0) {
      throw new Error(`[umpire] oneOf("${groupName}") branch "${branchName}" must not be empty`)
    }

    for (const field of fields) {
      if (seenFields.has(field)) {
        throw new Error(`[umpire] oneOf("${groupName}") field "${field}" appears in multiple branches`)
      }

      seenFields.add(field)
    }
  }

  if (typeof options?.activeBranch === 'string' && !(options.activeBranch in branches)) {
    throw new Error(
      `[umpire] Unknown active branch "${options.activeBranch}" for oneOf("${groupName}")`,
    )
  }

  const targets = branchNames.flatMap((branchName) => branches[branchName])

  const rule: InternalRuleCarrier<F, C> = {
    type: 'oneOf',
    targets,
    sources: uniqueFields([...targets]),
    evaluate(values, conditions, prev, fields) {
      const resolution = resolveOneOfState(
        groupName,
        branches,
        values,
        prev,
        options?.activeBranch,
        fields,
        conditions,
      )

      if (resolution.activeBranch === null) {
        return createResultMap(targets, () => ({ enabled: true, reason: null }))
      }

      return createResultMap(targets, (target) => {
        const inActiveBranch = branches[resolution.activeBranch as string].includes(target)
        return {
          enabled: inActiveBranch,
          reason: inActiveBranch
            ? null
            : resolveReason(
                options?.reason,
                values,
                conditions,
                `conflicts with ${resolution.activeBranch} strategy`,
              ),
        }
      })
    },
  }

  rule._umpire = {
    kind: 'oneOf',
    groupName,
    branches,
    options,
  }

  return rule
}

export function anyOf<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(...rules: Rule<F, C>[]): Rule<F, C> {
  if (rules.length === 0) {
    throw new Error('[umpire] anyOf() requires at least one rule')
  }

  const expectedTargets = uniqueFields([...rules[0].targets]).sort()

  for (const rule of rules.slice(1)) {
    const currentTargets = uniqueFields([...rule.targets]).sort()
    if (
      currentTargets.length !== expectedTargets.length ||
      currentTargets.some((target, index) => target !== expectedTargets[index])
    ) {
      throw new Error('[umpire] anyOf() rules must target the same fields')
    }
  }

  const sources = uniqueFields(rules.flatMap((rule) => rule.sources))
  const constraint = getRuleConstraint(rules[0])

  for (const innerRule of rules.slice(1)) {
    if (getRuleConstraint(innerRule) !== constraint) {
      throw new Error('[umpire] anyOf() cannot mix fairWhen rules with availability rules')
    }
  }

  const rule: InternalRuleCarrier<F, C> = {
    type: 'anyOf',
    targets: [...rules[0].targets],
    sources,
    evaluate(values, conditions, prev, fields, availability) {
      const evaluations = rules.map((rule) =>
        rule.evaluate(values, conditions, prev, fields, availability),
      )

      return createResultMap(rules[0].targets, (target) => {
        const targetResults = evaluations
          .map((evaluation) => evaluation.get(target))
          .filter((result): result is RuleEvaluation => !!result)

        if (constraint === 'fair') {
          if (targetResults.some((result) => result.fair !== false)) {
            return {
              enabled: true,
              fair: true,
              reason: null,
            }
          }

          const reasons = targetResults
            .map((result) => result.reason)
            .filter((reason): reason is string => reason !== null)

          return {
            enabled: true,
            fair: false,
            reason: reasons[0] ?? null,
            reasons: reasons.length === 0 ? undefined : reasons,
          }
        }

        if (targetResults.some((result) => result.enabled)) {
          return { enabled: true, reason: null }
        }

        const reasons = targetResults
          .map((result) => result.reason)
          .filter((reason): reason is string => reason !== null)

        return {
          enabled: false,
          reason: reasons[0] ?? null,
          reasons: reasons.length === 0 ? undefined : reasons,
        }
      })
    },
  }

  rule._umpire = {
    kind: 'anyOf',
    rules,
    constraint,
  }

  return rule
}

export function check<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  V = unknown,
>(
  field: FieldSelector<F, V>,
  validator: Validator<NonNullable<V>>,
): Predicate<F, C> {
  const target = getFieldNameOrThrow(field)

  const predicate = ((values: FieldValues<F>) => {
    const value = values[target]

    if (value == null) {
      return false
    }

    if (typeof validator === 'function') {
      return validator(value as NonNullable<V>)
    }

    if ('safeParse' in validator) {
      return validator.safeParse(value as NonNullable<V>).success
    }

    if ('test' in validator) {
      return typeof value === 'string' && validator.test(value)
    }

    return false
  }) as Predicate<F, C>

  predicate._checkField = target

  return predicate
}

/**
 * Returns typed versions of all rule factories, narrowed to your field and
 * condition types. Purely a type-level convenience — zero runtime overhead.
 *
 * ```ts
 * const { enabledWhen, requires } = createRules<typeof fields, MyConditions>()
 * // Predicate callbacks now have typed conditions automatically
 * ```
 */
export function createRules<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>() {
  return {
    enabledWhen: enabledWhen as typeof enabledWhen<F, C>,
    fairWhen: fairWhen as typeof fairWhen<F, C>,
    disables: disables as typeof disables<F, C>,
    requires: requires as typeof requires<F, C>,
    oneOf: oneOf as typeof oneOf<F, C>,
    anyOf: anyOf as typeof anyOf<F, C>,
    check: check as typeof check<F, C>,
  }
}
