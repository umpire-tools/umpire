import { isSatisfied } from './satisfaction.js'
import type { FieldDef, FieldValues, Rule } from './types.js'

type RuleResult = { enabled: boolean; reason: string | null; reasons?: string[] }

type Predicate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = ((values: FieldValues<F>, context: C) => boolean) & {
  _checkField?: keyof F & string
}

type ReasonOption<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = string | ((values: FieldValues<F>, context: C) => string)

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
  activeBranch?: string | ((values: FieldValues<F>) => string | null | undefined)
}

type FunctionValidator = (value: unknown) => boolean
type SafeParseValidator = { safeParse: (value: unknown) => { success: boolean } }
type TestValidator = { test: (value: unknown) => boolean }
type Validator = FunctionValidator | SafeParseValidator | TestValidator

function createResultMap<F extends Record<string, FieldDef>>(
  targets: Array<keyof F & string>,
  resultForTarget: (target: keyof F & string) => RuleResult,
): Map<string, { enabled: boolean; reason: string | null }> {
  const results = new Map<string, { enabled: boolean; reason: string | null }>()

  for (const target of targets) {
    results.set(
      target,
      resultForTarget(target) as { enabled: boolean; reason: string | null },
    )
  }

  return results
}

function resolveReason<F extends Record<string, FieldDef>, C extends Record<string, unknown>>(
  reason: ReasonOption<F, C> | undefined,
  values: FieldValues<F>,
  context: C,
  fallback: string,
): string {
  if (typeof reason === 'function') {
    return reason(values, context)
  }

  return reason ?? fallback
}

function getCheckField<F extends Record<string, FieldDef>, C extends Record<string, unknown>>(
  source: Predicate<F, C>,
): (keyof F & string) | undefined {
  return source._checkField
}

function getSourceFields<F extends Record<string, FieldDef>, C extends Record<string, unknown>>(
  source: Source<F, C>,
): Array<keyof F & string> {
  if (typeof source === 'string') {
    return [source]
  }

  const checkField = getCheckField(source)
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
  context: C,
): boolean {
  if (typeof source === 'string') {
    return isSatisfied(values[source])
  }

  return source(values, context)
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
): boolean {
  if (!values) {
    return false
  }

  return branchFields.some((field) => isSatisfied(values[field]))
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

function resolveOneOfBranch<F extends Record<string, FieldDef>>(
  groupName: string,
  branches: OneOfBranches<F>,
  values: FieldValues<F>,
  prev: FieldValues<F> | undefined,
  activeBranch: OneOfOptions<F, Record<string, unknown>>['activeBranch'],
): string | null {
  const branchNames = Object.keys(branches)

  if (typeof activeBranch === 'string') {
    return activeBranch
  }

  if (typeof activeBranch === 'function') {
    const resolvedBranch = activeBranch(values)
    if (resolvedBranch == null) {
      return null
    }
    if (!(resolvedBranch in branches)) {
      throw new Error(`Unknown active branch "${resolvedBranch}" for oneOf("${groupName}")`)
    }
    return resolvedBranch
  }

  const satisfiedBranches = branchNames.filter((branchName) =>
    branchHasSatisfiedField(branches[branchName], values),
  )

  if (satisfiedBranches.length === 0) {
    return null
  }

  if (satisfiedBranches.length === 1) {
    return satisfiedBranches[0]
  }

  if (prev) {
    const previouslySatisfiedBranches = new Set(
      branchNames.filter((branchName) => branchHasSatisfiedField(branches[branchName], prev)),
    )
    const newlySatisfiedBranches = satisfiedBranches.filter(
      (branchName) => !previouslySatisfiedBranches.has(branchName),
    )

    if (newlySatisfiedBranches.length === 1) {
      return newlySatisfiedBranches[0]
    }

    if (newlySatisfiedBranches.length > 1) {
      warnAmbiguousOneOf(groupName, satisfiedBranches)
      return satisfiedBranches[0]
    }
  }

  warnAmbiguousOneOf(groupName, satisfiedBranches)
  return satisfiedBranches[0]
}

export function enabledWhen<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  field: keyof F & string,
  predicate: Predicate<F, C>,
  options?: RuleOptions<F, C>,
): Rule<F, C> {
  return {
    type: 'enabledWhen',
    targets: [field],
    sources: [],
    evaluate(values, context) {
      const passed = predicate(values, context)

      return createResultMap([field], () => ({
        enabled: passed,
        reason: passed
          ? null
          : resolveReason(options?.reason, values, context, 'condition not met'),
      }))
    },
  }
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

  return {
    type: 'disables',
    targets,
    sources: getSourceFields(source),
    evaluate(values, context) {
      const active = isSourceActive(source, values, context)

      return createResultMap(targets, () => ({
        enabled: !active,
        reason: active ? resolveReason(options?.reason, values, context, defaultReason) : null,
      }))
    },
  }
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

  return {
    type: 'requires',
    targets: [field],
    sources: uniqueFields(
      dependencies.flatMap((dependency) => getSourceFields(dependency)),
    ),
    evaluate(values, context) {
      const reasons = dependencies.flatMap((dependency) => {
        const passed =
          typeof dependency === 'string'
            ? isSatisfied(values[dependency])
            : dependency(values, context)

        if (passed) {
          return []
        }

        const fallback =
          typeof dependency === 'string'
            ? `requires ${dependency}`
            : `required condition not met`

        return [resolveReason(options?.reason, values, context, fallback)]
      })

      return createResultMap([field], () => ({
        enabled: reasons.length === 0,
        reason: reasons[0] ?? null,
        reasons: reasons.length === 0 ? undefined : reasons,
      }))
    },
  }
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

  return {
    type: 'oneOf',
    targets,
    sources: uniqueFields([...targets]),
    evaluate(values, context, prev) {
      const activeBranch = resolveOneOfBranch(
        groupName,
        branches,
        values,
        prev,
        options?.activeBranch as OneOfOptions<F, Record<string, unknown>>['activeBranch'],
      )

      if (activeBranch === null) {
        return createResultMap(targets, () => ({ enabled: true, reason: null }))
      }

      return createResultMap(targets, (target) => {
        const inActiveBranch = branches[activeBranch].includes(target)
        return {
          enabled: inActiveBranch,
          reason: inActiveBranch
            ? null
            : resolveReason(
                options?.reason,
                values,
                context,
                `conflicts with ${activeBranch} strategy`,
              ),
        }
      })
    },
  }
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

  return {
    type: 'anyOf',
    targets: [...rules[0].targets],
    sources,
    evaluate(values, context, prev) {
      const evaluations = rules.map((rule) => rule.evaluate(values, context, prev))

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
