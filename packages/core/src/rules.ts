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

type Source<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = (keyof F & string) | Predicate<F, C>

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

type FunctionValidator = (value: unknown) => boolean
type SafeParseValidator = { safeParse: (value: unknown) => { success: boolean } }
type TestValidator = { test: (value: unknown) => boolean }
type Validator = FunctionValidator | SafeParseValidator | TestValidator

export type InternalPredicate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Predicate<F, C>

export type InternalSource<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Source<F, C>

export type InternalOneOfBranches<F extends Record<string, FieldDef>> = OneOfBranches<F>

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
      throw new Error(`Unknown active branch "${resolvedBranch}" for oneOf("${groupName}")`)
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
>(
  field: keyof F & string,
  predicate: Predicate<F, C>,
  options?: RuleOptions<F, C>,
): Rule<F, C> {
  const rule: InternalRuleCarrier<F, C> = {
    type: 'enabledWhen',
    targets: [field],
    sources: [],
    evaluate(values, conditions) {
      const passed = predicate(values, conditions)

      return createResultMap([field], () => ({
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
>(
  field: keyof F & string,
  ...deps: Array<Source<F, C> | RuleOptions<F, C>>
): Rule<F, C> {
  const maybeOptions = deps[deps.length - 1]
  const options = isReasonOptions<F, C>(maybeOptions) ? maybeOptions : undefined
  const dependencies = (options ? deps.slice(0, -1) : deps) as Array<Source<F, C>>

  const rule: InternalRuleCarrier<F, C> = {
    type: 'requires',
    targets: [field],
    sources: uniqueFields(
      dependencies.flatMap((dependency) => getSourceFields(dependency)),
    ),
    evaluate(values, conditions, _prev, fields) {
      const reasons = dependencies.flatMap((dependency) => {
        const passed =
          typeof dependency === 'string'
            ? isSatisfied(values[dependency], fields?.[dependency])
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

      return createResultMap([field], () => ({
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

  for (const branchName of branchNames) {
    const fields = branches[branchName]

    if (fields.length === 0) {
      throw new Error(`oneOf("${groupName}") branch "${branchName}" must not be empty`)
    }

    for (const field of fields) {
      if (seenFields.has(field)) {
        throw new Error(`oneOf("${groupName}") field "${field}" appears in multiple branches`)
      }

      seenFields.add(field)
    }
  }

  if (typeof options?.activeBranch === 'string' && !(options.activeBranch in branches)) {
    throw new Error(
      `Unknown active branch "${options.activeBranch}" for oneOf("${groupName}")`,
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
    throw new Error('anyOf() requires at least one rule')
  }

  const expectedTargets = uniqueFields([...rules[0].targets]).sort()

  for (const rule of rules.slice(1)) {
    const currentTargets = uniqueFields([...rule.targets]).sort()
    if (
      currentTargets.length !== expectedTargets.length ||
      currentTargets.some((target, index) => target !== expectedTargets[index])
    ) {
      throw new Error('anyOf() rules must target the same fields')
    }
  }

  const sources = uniqueFields(rules.flatMap((rule) => rule.sources))

  const rule: InternalRuleCarrier<F, C> = {
    type: 'anyOf',
    targets: [...rules[0].targets],
    sources,
    evaluate(values, conditions, prev, fields) {
      const evaluations = rules.map((rule) => rule.evaluate(values, conditions, prev, fields))

      return createResultMap(rules[0].targets, (target) => {
        const targetResults = evaluations
          .map((evaluation) => evaluation.get(target))
          .filter((result): result is { enabled: boolean; reason: string | null } => !!result)

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
  }

  return rule
}

export function check<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  field: keyof F & string,
  validator: Validator,
): Predicate<F, C> {
  const predicate = ((values: FieldValues<F>) => {
    const value = values[field]

    if (typeof validator === 'function') {
      return validator(value)
    }

    if ('safeParse' in validator) {
      return validator.safeParse(value).success
    }

    if ('test' in validator) {
      return validator.test(value)
    }

    return false
  }) as Predicate<F, C>

  predicate._checkField = field

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
    disables: disables as typeof disables<F, C>,
    requires: requires as typeof requires<F, C>,
    oneOf: oneOf as typeof oneOf<F, C>,
    anyOf: anyOf as typeof anyOf<F, C>,
    check: check as typeof check<F, C>,
  }
}
