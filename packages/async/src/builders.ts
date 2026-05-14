import type {
  AvailabilityMap,
  FieldDef,
  FieldValues,
  NamedCheckMetadata,
  Rule,
  RuleTraceAttachment,
} from '@umpire/core'
import { isNamedCheck, isSatisfied } from '@umpire/core'
import {
  combineCompositeResults,
  getCompositeTargetEvaluation,
  getRuleConstraint,
  resolveOneOfState,
  runFieldValidator,
} from '@umpire/core/internal'
import { isAsyncRule, isAsyncSafeParseValidator } from './guards.js'
import type {
  AnyRule,
  AnyValidationValidator,
  AsyncRule,
  RuleEvaluation,
} from './types.js'

// ---------------------------------------------------------------------------
// Async carrier — mirrors core's InternalRuleCarrier with the async marker
// ---------------------------------------------------------------------------

type AsyncRuleCarrier<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = AsyncRule<F, C> & {
  _umpire?: InternalRuleMetadata<F, C>
}

// ---------------------------------------------------------------------------
// Async predicate types (widened to accept async)
// ---------------------------------------------------------------------------

type Predicate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = ((values: FieldValues<F>, conditions: C) => boolean | Promise<boolean>) & {
  _checkField?: keyof F & string
  _namedCheck?: NamedCheckMetadata
}

type FairPredicate<
  V,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = ((
  value: NonNullable<V>,
  values: FieldValues<F>,
  conditions: C,
) => boolean | Promise<boolean>) & {
  _checkField?: keyof F & string
}

type Source<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = (keyof F & string) | Predicate<F, C>

type SourceInput<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = FieldSelector<F> | Predicate<F, C>

type ReasonOption<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> =
  | string
  | ((values: FieldValues<F>, conditions: C) => string | Promise<string>)

type RuleOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  reason?: ReasonOption<F, C>
  trace?:
    | RuleTraceAttachment<FieldValues<F>, C>
    | RuleTraceAttachment<FieldValues<F>, C>[]
}

type OneOfBranches<F extends Record<string, FieldDef>> = Record<
  string,
  Array<keyof F & string>
>

type OneOfBranchesInput<F extends Record<string, FieldDef>> = Record<
  string,
  Array<FieldSelector<F>>
>

type EitherOfBranches<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Record<string, Array<AnyRule<F, C>>>

type OneOfOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  BranchName extends string = string,
> = RuleOptions<F, C> & {
  activeBranch?:
    | BranchName
    | ((
        values: FieldValues<F>,
        conditions: C,
      ) =>
        | BranchName
        | null
        | undefined
        | Promise<BranchName | null | undefined>)
}

// ---------------------------------------------------------------------------
// Internal metadata — mirrors core's InternalRuleMetadata
// ---------------------------------------------------------------------------

type InternalRuleMetadata<
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
      rules: AnyRule<F, C>[]
      constraint: 'enabled' | 'fair'
    }
  | {
      kind: 'eitherOf'
      groupName: string
      branches: EitherOfBranches<F, C>
      constraint: 'enabled' | 'fair'
    }
  | {
      kind: 'custom'
      constraint: 'enabled' | 'fair'
    }

// ---------------------------------------------------------------------------
// Field selector helpers (inlined from @umpire/core/field — not publicly exported)
// ---------------------------------------------------------------------------

type FieldSelector<F extends Record<string, FieldDef>> =
  | (keyof F & string)
  | { readonly __umpfield: keyof F & string }
  | { readonly __umpfield: string }

function getFieldBuilderName(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('__umpfield' in value)) {
    return undefined
  }

  const name = (value as { __umpfield?: unknown }).__umpfield
  return typeof name === 'string' ? name : undefined
}

function getFieldNameOrThrow<F extends Record<string, FieldDef>>(
  field: FieldSelector<F>,
): keyof F & string {
  if (typeof field === 'string') {
    return field
  }

  const name = getFieldBuilderName(field)
  if (!name) {
    throw new Error(
      '[@umpire/async] Named field builder required when passing a field() value to a rule',
    )
  }

  return name as keyof F & string
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function createResultMap<F extends Record<string, FieldDef>>(
  targets: Array<keyof F & string>,
  resultForTarget: (target: keyof F & string) => RuleEvaluation,
): Map<string, RuleEvaluation> {
  const results = new Map<string, RuleEvaluation>()

  for (const target of targets) {
    results.set(target, resultForTarget(target))
  }

  return results
}

function createSingleResultMap<F extends Record<string, FieldDef>>(
  target: keyof F & string,
  result: RuleEvaluation,
): Map<string, RuleEvaluation> {
  const results = new Map<string, RuleEvaluation>()
  results.set(target, result)
  return results
}

function uniqueFields<F extends Record<string, FieldDef>>(
  fields: Array<keyof F & string>,
): Array<keyof F & string> {
  return [...new Set(fields)]
}

// ---------------------------------------------------------------------------
// Source helpers
// ---------------------------------------------------------------------------

function getCheckField<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(source: Predicate<F, C>): (keyof F & string) | undefined {
  return source._checkField
}

function getFairCheckField<
  V,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(predicate: FairPredicate<V, F, C>): (keyof F & string) | undefined {
  return predicate._checkField
}

function getSourceFields<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(source: Source<F, C>): Array<keyof F & string> {
  if (typeof source === 'string') {
    return [source]
  }

  const checkField = getCheckField(source)
  return checkField ? [checkField] : []
}

function getFairSourceFields<
  V,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(predicate: FairPredicate<V, F, C>): Array<keyof F & string> {
  const checkField = getFairCheckField(predicate)
  return checkField ? [checkField] : []
}

function getSourceLabel<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(source: Predicate<F, C>): string {
  return getCheckField(source) ?? 'condition'
}

function normalizeSource<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(source: SourceInput<F, C>): Source<F, C> {
  if (typeof source === 'function') {
    return source
  }

  return getFieldNameOrThrow(source)
}

function normalizeBranches<F extends Record<string, FieldDef>>(
  branches: OneOfBranchesInput<F>,
): OneOfBranches<F> {
  return Object.fromEntries(
    Object.entries(branches).map(([branchName, branchFields]) => [
      branchName,
      branchFields.map((field) => getFieldNameOrThrow(field)),
    ]),
  ) as OneOfBranches<F>
}

// ---------------------------------------------------------------------------
// Source evaluation
// ---------------------------------------------------------------------------

async function isSourceActive<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  source: Source<F, C>,
  values: FieldValues<F>,
  conditions: C,
  fields?: F,
): Promise<boolean> {
  if (typeof source === 'string') {
    return isSatisfied(values[source], fields?.[source])
  }

  return source(values, conditions)
}

async function checkPredicateDependency<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  dependency: Predicate<F, C>,
  values: FieldValues<F>,
  conditions: C,
  availability: Partial<AvailabilityMap<F>> | undefined,
): Promise<boolean> {
  const sourceField = getCheckField(dependency)
  if (
    sourceField &&
    (availability?.[sourceField]?.enabled === false ||
      availability?.[sourceField]?.fair === false)
  ) {
    return false
  }

  return dependency(values, conditions)
}

function checkStringDependency<F extends Record<string, FieldDef>>(
  dependency: keyof F & string,
  values: FieldValues<F>,
  fields: F | undefined,
  availability: Partial<AvailabilityMap<F>> | undefined,
): boolean {
  return (
    isSatisfied(values[dependency], fields?.[dependency]) &&
    (availability?.[dependency]?.enabled ?? true) &&
    (availability?.[dependency]?.fair ?? true)
  )
}

async function isRequiredDependencySatisfied<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  dependency: Source<F, C>,
  values: FieldValues<F>,
  conditions: C,
  fields: F | undefined,
  availability: Partial<AvailabilityMap<F>> | undefined,
): Promise<boolean> {
  if (typeof dependency !== 'string') {
    return checkPredicateDependency(
      dependency,
      values,
      conditions,
      availability,
    )
  }

  return checkStringDependency(dependency, values, fields, availability)
}

function getRequiredDependencyFallback<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(dependency: Source<F, C>): string {
  if (typeof dependency === 'string') {
    return `requires ${dependency}`
  }

  return `required condition not met`
}

// ---------------------------------------------------------------------------
// Options helpers
// ---------------------------------------------------------------------------

function isRuleOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(value: unknown): value is RuleOptions<F, C> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value !== 'function' &&
    ('reason' in value || 'trace' in value)
  )
}

// ---------------------------------------------------------------------------
// Resolve reason (wraps core's resolveReason with async support)
// ---------------------------------------------------------------------------

async function resolveReasonAsync<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  reason: ReasonOption<F, C> | undefined,
  values: FieldValues<F>,
  conditions: C,
  fallback: string,
): Promise<string> {
  if (typeof reason === 'function') {
    return reason(values, conditions)
  }

  return reason ?? fallback
}

// ---------------------------------------------------------------------------
// Composite rule shape validation
// ---------------------------------------------------------------------------

function resolveCompositeRuleShape<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  label: string,
  rules: AnyRule<F, C>[],
): {
  targets: Array<keyof F & string>
  sources: Array<keyof F & string>
  constraint: 'enabled' | 'fair'
} {
  const expectedTargets = uniqueFields([...rules[0].targets]).sort()

  for (const rule of rules.slice(1)) {
    const currentTargets = uniqueFields([...rule.targets]).sort()

    if (
      currentTargets.length !== expectedTargets.length ||
      currentTargets.some((target, index) => target !== expectedTargets[index])
    ) {
      throw new Error(
        `[@umpire/async] ${label} rules must target the same fields`,
      )
    }
  }

  const constraint = getRuleConstraint(rules[0] as unknown as Rule<F, C>)

  for (const innerRule of rules.slice(1)) {
    if (getRuleConstraint(innerRule as unknown as Rule<F, C>) !== constraint) {
      throw new Error(
        `[@umpire/async] ${label} cannot mix fairWhen rules with availability rules`,
      )
    }
  }

  return {
    targets: [...rules[0].targets],
    sources: uniqueFields(rules.flatMap((rule) => rule.sources)),
    constraint,
  }
}

// ---------------------------------------------------------------------------
// cloneNamedCheckMetadata
// ---------------------------------------------------------------------------

function cloneNamedCheckMetadata(
  metadata: NamedCheckMetadata,
): NamedCheckMetadata {
  const params = metadata.params
    ? Object.freeze({ ...metadata.params })
    : undefined

  if (!params) {
    return Object.freeze({ __check: metadata.__check })
  }

  return Object.freeze({
    __check: metadata.__check,
    params,
  })
}

// ---------------------------------------------------------------------------
// Run any field validator (sync + async)
// ---------------------------------------------------------------------------

async function runAnyFieldValidator<T>(
  validator: AnyValidationValidator<T>,
  value: NonNullable<T>,
): Promise<boolean> {
  if (isAsyncSafeParseValidator<T>(validator)) {
    const result = await validator.safeParseAsync(value)
    return result.success
  }

  if (typeof validator === 'function') {
    const result = validator(value)

    if (result instanceof Promise) {
      const awaited = await result
      return typeof awaited === 'boolean' ? awaited : awaited.valid
    }

    return typeof result === 'boolean' ? result : result.valid
  }

  return runFieldValidator(validator as never, value)
}

// ===========================================================================
// Builders
// ===========================================================================

/**
 * Advanced escape hatch for defining custom low-level async rules.
 *
 * Prefer the built-in factories unless you truly need custom evaluation
 * behaviour. `defineRule()` is intended for power users who need to plug an
 * async rule directly into Umpire's evaluation pipeline.
 */
export function defineRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(config: {
  type: string
  targets: Array<keyof F & string>
  sources?: Array<keyof F & string>
  constraint?: 'enabled' | 'fair'
  evaluate: AsyncRule<F, C>['evaluate']
}): AsyncRule<F, C> {
  const rule: AsyncRuleCarrier<F, C> = {
    __async: true,
    type: config.type,
    targets: uniqueFields([...config.targets]),
    sources: uniqueFields([...(config.sources ?? [])]),
    evaluate: config.evaluate,
  }

  rule._umpire = {
    kind: 'custom',
    constraint: config.constraint ?? 'enabled',
  }

  return rule
}

export function enabledWhen<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  field: FieldSelector<F>,
  predicate: Predicate<F, C>,
  options?: RuleOptions<F, C>,
): AsyncRule<F, C> {
  const target = getFieldNameOrThrow(field)

  const rule: AsyncRuleCarrier<F, C> = {
    __async: true,
    type: 'enabledWhen',
    targets: [target],
    sources: [],
    evaluate: async (
      values,
      conditions,
      _prev,
      _fields,
      _availability,
      signal,
    ) => {
      signal.throwIfAborted()
      const passed = await predicate(values, conditions)

      return createSingleResultMap(target, {
        enabled: passed,
        reason: passed
          ? null
          : await resolveReasonAsync(
              options?.reason,
              values,
              conditions,
              'condition not met',
            ),
      })
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
  field: FieldSelector<F>,
  predicate: FairPredicate<V, F, C>,
  options?: RuleOptions<F, C>,
): AsyncRule<F, C> {
  const target = getFieldNameOrThrow(field)

  const rule: AsyncRuleCarrier<F, C> = {
    __async: true,
    type: 'fairWhen',
    targets: [target],
    sources: getFairSourceFields(predicate),
    evaluate: async (
      values,
      conditions,
      _prev,
      fields,
      _availability,
      signal,
    ) => {
      signal.throwIfAborted()
      const value = values[target]

      if (!isSatisfied(value, fields?.[target])) {
        return createSingleResultMap(target, {
          enabled: true,
          fair: true,
          reason: null,
        })
      }

      const passed = await predicate(
        value as NonNullable<V>,
        values,
        conditions,
      )

      return createSingleResultMap(target, {
        enabled: true,
        fair: passed,
        reason: passed
          ? null
          : await resolveReasonAsync(
              options?.reason,
              values,
              conditions,
              'selection is no longer valid',
            ),
      })
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
  source: SourceInput<F, C>,
  targets: Array<FieldSelector<F>>,
  options?: RuleOptions<F, C>,
): AsyncRule<F, C> {
  const resolvedSource = normalizeSource(source)
  const resolvedTargets = targets.map((target) => getFieldNameOrThrow(target))
  const defaultReason =
    typeof resolvedSource === 'string'
      ? `overridden by ${resolvedSource}`
      : `overridden by ${getSourceLabel(resolvedSource)}`

  const rule: AsyncRuleCarrier<F, C> = {
    __async: true,
    type: 'disables',
    targets: resolvedTargets,
    sources: getSourceFields(resolvedSource),
    evaluate: async (
      values,
      conditions,
      _prev,
      fields,
      _availability,
      signal,
    ) => {
      signal.throwIfAborted()
      const active = await isSourceActive(
        resolvedSource,
        values,
        conditions,
        fields,
      )

      const reason = active
        ? await resolveReasonAsync(
            options?.reason,
            values,
            conditions,
            defaultReason,
          )
        : null

      return createResultMap(resolvedTargets, () => ({
        enabled: !active,
        reason,
      }))
    },
  }

  rule._umpire = {
    kind: 'disables',
    source: resolvedSource,
    options,
  }

  return rule
}

export function requires<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  field: FieldSelector<F>,
  ...deps: Array<SourceInput<F, C> | RuleOptions<F, C>>
): AsyncRule<F, C> {
  const target = getFieldNameOrThrow(field)
  const maybeOptions = deps[deps.length - 1]
  const options = isRuleOptions<F, C>(maybeOptions) ? maybeOptions : undefined
  const dependencies: Array<Source<F, C>> = (
    options ? deps.slice(0, -1) : deps
  ).map((dependency) => normalizeSource(dependency as SourceInput<F, C>))

  if (dependencies.length === 0) {
    throw new Error(
      `[@umpire/async] requires("${target}") requires at least one dependency`,
    )
  }

  const rule: AsyncRuleCarrier<F, C> = {
    __async: true,
    type: 'requires',
    targets: [target],
    sources: uniqueFields(
      dependencies.flatMap((dependency) => getSourceFields(dependency)),
    ),
    evaluate: async (
      values,
      conditions,
      _prev,
      fields,
      availability,
      signal,
    ) => {
      signal.throwIfAborted()
      let reason: string | null = null
      let reasons: string[] | undefined

      for (const dependency of dependencies) {
        const satisfied = await isRequiredDependencySatisfied(
          dependency,
          values,
          conditions,
          fields,
          availability,
        )

        if (satisfied) {
          continue
        }

        const resolvedReason = await resolveReasonAsync(
          options?.reason,
          values,
          conditions,
          getRequiredDependencyFallback(dependency),
        )

        if (reason === null) {
          reason = resolvedReason
        }

        reasons ??= []
        reasons.push(resolvedReason)
      }

      return createSingleResultMap(target, {
        enabled: reasons === undefined,
        reason,
        reasons,
      })
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
  B extends OneOfBranchesInput<F> = OneOfBranchesInput<F>,
>(
  groupName: string,
  branches: B,
  options?: OneOfOptions<F, C, keyof B & string>,
): AsyncRule<F, C> {
  const resolvedBranches = normalizeBranches(branches)
  const seenFields = new Set<string>()
  const branchNames = Object.keys(resolvedBranches)

  if (branchNames.length === 0) {
    throw new Error(
      `[@umpire/async] oneOf("${groupName}") must include at least one branch`,
    )
  }

  for (const branchName of branchNames) {
    const fields = resolvedBranches[branchName]

    if (fields.length === 0) {
      throw new Error(
        `[@umpire/async] oneOf("${groupName}") branch "${branchName}" must not be empty`,
      )
    }

    for (const field of fields) {
      if (seenFields.has(field)) {
        throw new Error(
          `[@umpire/async] oneOf("${groupName}") field "${field}" appears in multiple branches`,
        )
      }

      seenFields.add(field)
    }
  }

  if (
    typeof options?.activeBranch === 'string' &&
    !(options.activeBranch in resolvedBranches)
  ) {
    throw new Error(
      `[@umpire/async] Unknown active branch "${options.activeBranch}" for oneOf("${groupName}")`,
    )
  }

  const targets = branchNames.flatMap(
    (branchName) => resolvedBranches[branchName],
  )

  const rule: AsyncRuleCarrier<F, C> = {
    __async: true,
    type: 'oneOf',
    targets,
    sources: uniqueFields([...targets]),
    evaluate: async (
      values,
      conditions,
      prev,
      fields,
      _availability,
      signal,
    ) => {
      signal.throwIfAborted()

      const resolvedActiveBranch =
        typeof options?.activeBranch === 'function'
          ? await options.activeBranch(values, conditions)
          : options?.activeBranch

      if (
        typeof resolvedActiveBranch === 'string' &&
        !(resolvedActiveBranch in resolvedBranches)
      ) {
        throw new Error(
          `[@umpire/async] Unknown active branch "${resolvedActiveBranch}" for oneOf("${groupName}")`,
        )
      }

      const resolution = resolveOneOfState(
        groupName,
        resolvedBranches,
        values,
        prev,
        resolvedActiveBranch as string | undefined,
        fields,
        conditions,
      )

      if (resolution.activeBranch === null) {
        return createResultMap(targets, () => ({
          enabled: true,
          reason: null,
        }))
      }

      const disabledReason = await resolveReasonAsync(
        options?.reason,
        values,
        conditions,
        `conflicts with ${resolution.activeBranch} strategy`,
      )

      return createResultMap(targets, (target) => {
        const inActiveBranch =
          resolvedBranches[resolution.activeBranch as string].includes(target)
        return {
          enabled: inActiveBranch,
          reason: inActiveBranch ? null : disabledReason,
        }
      })
    },
  }

  rule._umpire = {
    kind: 'oneOf',
    groupName,
    branches: resolvedBranches,
    options,
  }

  return rule
}

export function anyOf<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(...rules: AnyRule<F, C>[]): AsyncRule<F, C> {
  if (rules.length === 0) {
    throw new Error('[@umpire/async] anyOf() requires at least one rule')
  }

  const { targets, sources, constraint } = resolveCompositeRuleShape(
    'anyOf()',
    rules,
  )

  const rule: AsyncRuleCarrier<F, C> = {
    __async: true,
    type: 'anyOf',
    targets,
    sources,
    evaluate: async (
      values,
      conditions,
      prev,
      fields,
      availability,
      signal,
    ) => {
      signal.throwIfAborted()

      const evaluations = await Promise.all(
        rules.map((r) => {
          if (isAsyncRule(r)) {
            return r.evaluate(
              values,
              conditions,
              prev,
              fields!,
              availability,
              signal,
            )
          }

          return r.evaluate(values, conditions, prev, fields, availability)
        }),
      )

      return createResultMap(targets, (target) => {
        const targetResults = evaluations.map((evaluation) =>
          getCompositeTargetEvaluation(evaluation, target),
        )

        return combineCompositeResults(constraint, 'or', targetResults)
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

export function eitherOf<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(groupName: string, branches: EitherOfBranches<F, C>): AsyncRule<F, C> {
  const branchNames = Object.keys(branches)

  if (branchNames.length === 0) {
    throw new Error(
      `[@umpire/async] eitherOf("${groupName}") must include at least one branch`,
    )
  }

  for (const branchName of branchNames) {
    if (branches[branchName].length === 0) {
      throw new Error(
        `[@umpire/async] eitherOf("${groupName}") branch "${branchName}" must not be empty`,
      )
    }
  }

  const rules = Object.values(branches).flatMap((branchRules) => branchRules)
  const label = `eitherOf("${groupName}")`
  const { targets, sources, constraint } = resolveCompositeRuleShape(
    label,
    rules,
  )

  const rule: AsyncRuleCarrier<F, C> = {
    __async: true,
    type: 'eitherOf',
    targets,
    sources,
    evaluate: async (
      values,
      conditions,
      prev,
      fields,
      availability,
      signal,
    ) => {
      signal.throwIfAborted()

      const branchEvaluations: Record<
        string,
        Array<Map<string, RuleEvaluation>>
      > = {}

      for (const branchName of branchNames) {
        branchEvaluations[branchName] = await Promise.all(
          branches[branchName].map((r) => {
            if (isAsyncRule(r)) {
              return r.evaluate(
                values,
                conditions,
                prev,
                fields!,
                availability,
                signal,
              )
            }

            return r.evaluate(values, conditions, prev, fields, availability)
          }),
        )
      }

      return createResultMap(targets, (target) => {
        const branchResults = branchNames.map((branchName) => {
          const targetResults = branchEvaluations[branchName].map(
            (evaluation) => getCompositeTargetEvaluation(evaluation, target),
          )

          return combineCompositeResults(constraint, 'and', targetResults)
        })

        return combineCompositeResults(constraint, 'or', branchResults)
      })
    },
  }

  rule._umpire = {
    kind: 'eitherOf',
    groupName,
    branches,
    constraint,
  }

  return rule
}

export function check<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  V = unknown,
>(
  field: FieldSelector<F>,
  validator: AnyValidationValidator<NonNullable<V>>,
): Predicate<F, C> {
  const target = getFieldNameOrThrow(field)

  const namedCheckMetadata = isNamedCheck(validator)
    ? cloneNamedCheckMetadata(validator as NamedCheckMetadata)
    : undefined

  const predicate = (async (values: FieldValues<F>, _conditions: C) => {
    const value = values[target]

    if (value == null) {
      return false
    }

    return runAnyFieldValidator(validator, value as NonNullable<V>)
  }) as Predicate<F, C>

  predicate._checkField = target

  if (namedCheckMetadata) {
    predicate._namedCheck = namedCheckMetadata
  }

  return predicate
}

/**
 * Returns typed versions of all async rule factories, narrowed to your field
 * and condition types. Purely a type-level convenience — zero runtime overhead.
 */
export function createRules<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>() {
  return {
    defineRule: defineRule as typeof defineRule<F, C>,
    enabledWhen: enabledWhen as typeof enabledWhen<F, C>,
    fairWhen: fairWhen as typeof fairWhen<F, C>,
    disables: disables as typeof disables<F, C>,
    requires: requires as typeof requires<F, C>,
    oneOf: oneOf as typeof oneOf<F, C>,
    anyOf: anyOf as typeof anyOf<F, C>,
    eitherOf: eitherOf as typeof eitherOf<F, C>,
    check: check as typeof check<F, C>,
  }
}
