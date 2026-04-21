import {
  combineCompositeResults,
  getCompositeTargetEvaluation,
} from './composite.js'
import { shouldWarnInDev } from './dev.js'
import { getFieldNameOrThrow, type FieldSelector } from './field.js'
import { isSatisfied } from './satisfaction.js'
import {
  isNamedCheck as isNamedCheckValidator,
  runFieldValidator,
} from './validation.js'
import type {
  FieldValidator,
  FieldDef,
  FieldValues,
  NamedCheckMetadata,
  Rule,
  RuleEvaluation,
  RuleTraceAttachment,
} from './types.js'

type RuleResult = RuleEvaluation

/**
 * Controls which evaluation phase a custom rule participates in.
 *
 * - `'enabled'` is the default and behaves like an availability rule:
 *   it can disable a field.
 * - `'fair'` behaves like `fairWhen()`:
 *   it can mark a field unfair without disabling it.
 *
 * For graphing purposes, `'enabled'` sources are treated as ordering edges,
 * while `'fair'` sources are treated as informational edges.
 */
export type RuleConstraint = 'enabled' | 'fair'

export type PredicateInspection<Field extends string = string> = {
  field?: Field
  namedCheck?: NamedCheckMetadata
}

export type RuleOperandInspection<Field extends string = string> =
  | {
      kind: 'field'
      field: Field
    }
  | {
      kind: 'predicate'
      predicate?: PredicateInspection<Field>
    }

export type RuleInspection<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> =
  | {
      kind: 'enabledWhen'
      target: keyof F & string
      predicate?: PredicateInspection<keyof F & string>
      reason?: string
      hasDynamicReason: boolean
    }
  | {
      kind: 'disables'
      source: RuleOperandInspection<keyof F & string>
      targets: Array<keyof F & string>
      reason?: string
      hasDynamicReason: boolean
    }
  | {
      kind: 'fairWhen'
      target: keyof F & string
      predicate?: PredicateInspection<keyof F & string>
      reason?: string
      hasDynamicReason: boolean
    }
  | {
      kind: 'requires'
      target: keyof F & string
      dependencies: Array<RuleOperandInspection<keyof F & string>>
      reason?: string
      hasDynamicReason: boolean
    }
  | {
      kind: 'oneOf'
      groupName: string
      branches: Record<string, Array<keyof F & string>>
      activeBranch?: string
      hasDynamicActiveBranch: boolean
      reason?: string
      hasDynamicReason: boolean
    }
  | {
      kind: 'anyOf'
      constraint: RuleConstraint
      rules: Array<RuleInspection<F, C>>
    }
  | {
      kind: 'eitherOf'
      groupName: string
      constraint: RuleConstraint
      branches: Record<string, Array<RuleInspection<F, C>>>
    }
  | {
      kind: 'custom'
      type: string
      constraint: RuleConstraint
      targets: Array<keyof F & string>
      sources: Array<keyof F & string>
    }

type Predicate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = ((values: FieldValues<F>, conditions: C) => boolean) & {
  _checkField?: keyof F & string
  _namedCheck?: NamedCheckMetadata
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
  trace?:
    | RuleTraceAttachment<FieldValues<F>, C>
    | RuleTraceAttachment<FieldValues<F>, C>[]
}

type Source<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = (keyof F & string) | Predicate<F, C>

type SourceInput<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = FieldSelector<F> | Predicate<F, C>

type FairPredicate<
  V,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = ((
  value: NonNullable<V>,
  values: FieldValues<F>,
  conditions: C,
) => boolean) & {
  _checkField?: keyof F & string
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
> = Record<string, Array<Rule<F, C>>>

type OneOfOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  BranchName extends string = string,
> = RuleOptions<F, C> & {
  activeBranch?:
    | BranchName
    | ((values: FieldValues<F>, conditions: C) => BranchName | null | undefined)
}

export type InternalPredicate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Predicate<F, C>

export type InternalSource<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Source<F, C>

export type InternalOneOfBranches<F extends Record<string, FieldDef>> =
  OneOfBranches<F>

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
  | {
      kind: 'eitherOf'
      groupName: string
      branches: EitherOfBranches<F, C>
      constraint: 'enabled' | 'fair'
    }
  | {
      kind: 'custom'
      constraint: RuleConstraint
    }

type InternalRuleMetadataWithOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Exclude<
  InternalRuleMetadata<F, C>,
  { kind: 'anyOf' } | { kind: 'eitherOf' } | { kind: 'custom' }
>

type InternalRuleCarrier<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Rule<F, C> & {
  _umpire?: InternalRuleMetadata<F, C>
}

type NamedCheckMetadataCarrier = {
  _namedCheck?: NamedCheckMetadata
}

export type DefineRuleConfig<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> = {
  /**
   * Label surfaced in introspection output such as `challenge()`.
   *
   * This is a user-defined rule type label, not a custom internal rule kind.
   */
  type: string
  /**
   * Fields evaluated by this rule.
   *
   * The evaluator expects the returned result map to include an entry for each
   * target. Omitted targets are treated as passing by default, so omissions
   * should be intentional.
   */
  targets: Array<keyof F & string>
  /**
   * Known source fields used for graph edges and related introspection.
   *
   * For `'enabled'` rules these are treated as ordering dependencies.
   * For `'fair'` rules these are treated as informational dependencies.
   */
  sources?: Array<keyof F & string>
  /**
   * Which phase this rule participates in.
   *
   * Defaults to `'enabled'`.
   */
  constraint?: RuleConstraint
  /**
   * Low-level evaluation function returning per-target results.
   */
  evaluate: Rule<F, C>['evaluate']
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
    results.set(target, resultForTarget(target))
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

export function getSourceField<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(source: InternalSource<F, C>): (keyof F & string) | undefined {
  if (typeof source === 'string') {
    return source
  }

  return getCheckField(source)
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

export function getInternalRuleMetadata<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: Rule<F, C>): InternalRuleMetadata<F, C> | undefined {
  return (rule as InternalRuleCarrier<F, C>)._umpire
}

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

function isNamedCheckMetadataCarrier(
  value: unknown,
): value is NamedCheckMetadataCarrier {
  return (
    (typeof value === 'function' || typeof value === 'object') && value !== null
  )
}

function hasNamedCheckMetadata(
  value: unknown,
): value is NamedCheckMetadataCarrier & { _namedCheck: NamedCheckMetadata } {
  return isNamedCheckMetadataCarrier(value) && value._namedCheck !== undefined
}

export function getNamedCheckMetadata(
  value: unknown,
): NamedCheckMetadata | undefined {
  if (isNamedCheckValidator(value)) {
    return cloneNamedCheckMetadata(value)
  }

  if (!hasNamedCheckMetadata(value)) {
    return undefined
  }

  return cloneNamedCheckMetadata(value._namedCheck)
}

function getPredicateField(value: unknown): string | undefined {
  if (
    (typeof value !== 'function' && typeof value !== 'object') ||
    value === null
  ) {
    return undefined
  }

  if (!('_checkField' in value)) {
    return undefined
  }

  const field = (value as { _checkField?: unknown })._checkField
  return typeof field === 'string' ? field : undefined
}

export function inspectPredicate<Field extends string = string>(
  value: unknown,
): PredicateInspection<Field> | undefined {
  const field = getPredicateField(value) as Field | undefined
  const namedCheck = getNamedCheckMetadata(value)

  if (field === undefined && namedCheck === undefined) {
    return undefined
  }

  if (field !== undefined && namedCheck !== undefined) {
    return { field, namedCheck }
  }

  if (field !== undefined) {
    return { field }
  }

  return { namedCheck }
}

function inspectReasonOption<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  options: RuleOptions<F, C> | OneOfOptions<F, C> | undefined,
): { reason?: string; hasDynamicReason: boolean } {
  const reason = options?.reason

  if (typeof reason === 'function') {
    return { hasDynamicReason: true }
  }

  if (typeof reason === 'string') {
    return { reason, hasDynamicReason: false }
  }

  return { hasDynamicReason: false }
}

function inspectOperand<Field extends string = string>(
  value: unknown,
): RuleOperandInspection<Field> {
  if (typeof value === 'string') {
    return {
      kind: 'field',
      field: value as Field,
    }
  }

  return {
    kind: 'predicate',
    predicate: inspectPredicate<Field>(value),
  }
}

function cloneBranches<F extends Record<string, FieldDef>>(
  branches: OneOfBranches<F>,
): Record<string, Array<keyof F & string>> {
  return Object.fromEntries(
    Object.entries(branches).map(([branch, fields]) => [branch, [...fields]]),
  ) as Record<string, Array<keyof F & string>>
}

function getBranchRules<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(branches: EitherOfBranches<F, C>): Rule<F, C>[] {
  return Object.values(branches).flatMap((branchRules) => branchRules)
}

function resolveCompositeRuleShape<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  label: string,
  rules: Rule<F, C>[],
): {
  targets: Array<keyof F & string>
  sources: Array<keyof F & string>
  constraint: RuleConstraint
} {
  const expectedTargets = uniqueFields([...rules[0].targets]).sort()

  for (const rule of rules.slice(1)) {
    const currentTargets = uniqueFields([...rule.targets]).sort()

    if (
      currentTargets.length !== expectedTargets.length ||
      currentTargets.some((target, index) => target !== expectedTargets[index])
    ) {
      throw new Error(
        `[@umpire/core] ${label} rules must target the same fields`,
      )
    }
  }

  const constraint = getRuleConstraint(rules[0])

  for (const innerRule of rules.slice(1)) {
    if (getRuleConstraint(innerRule) !== constraint) {
      throw new Error(
        `[@umpire/core] ${label} cannot mix fairWhen rules with availability rules`,
      )
    }
  }

  return {
    targets: [...rules[0].targets],
    sources: uniqueFields(rules.flatMap((rule) => rule.sources)),
    constraint,
  }
}

export function inspectRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: Rule<F, C>): RuleInspection<F, C> | undefined {
  const metadata = getInternalRuleMetadata(rule)

  if (!metadata) {
    return undefined
  }

  if (metadata.kind === 'enabledWhen') {
    return {
      kind: 'enabledWhen',
      target: rule.targets[0],
      predicate: inspectPredicate<keyof F & string>(metadata.predicate),
      ...inspectReasonOption(metadata.options),
    }
  }

  if (metadata.kind === 'disables') {
    return {
      kind: 'disables',
      source: inspectOperand<keyof F & string>(metadata.source),
      targets: [...rule.targets],
      ...inspectReasonOption(metadata.options),
    }
  }

  if (metadata.kind === 'fairWhen') {
    return {
      kind: 'fairWhen',
      target: rule.targets[0],
      predicate: inspectPredicate<keyof F & string>(metadata.predicate),
      ...inspectReasonOption(metadata.options),
    }
  }

  if (metadata.kind === 'requires') {
    return {
      kind: 'requires',
      target: rule.targets[0],
      dependencies: metadata.dependencies.map((dependency) =>
        inspectOperand<keyof F & string>(dependency),
      ),
      ...inspectReasonOption(metadata.options),
    }
  }

  if (metadata.kind === 'oneOf') {
    return {
      kind: 'oneOf',
      groupName: metadata.groupName,
      branches: cloneBranches(metadata.branches),
      activeBranch:
        typeof metadata.options?.activeBranch === 'string'
          ? metadata.options.activeBranch
          : undefined,
      hasDynamicActiveBranch:
        typeof metadata.options?.activeBranch === 'function',
      ...inspectReasonOption(metadata.options),
    }
  }

  if (metadata.kind === 'anyOf') {
    const inspectedRules = metadata.rules.map((innerRule) =>
      inspectRule(innerRule),
    )

    if (inspectedRules.some((entry) => entry === undefined)) {
      return undefined
    }

    return {
      kind: 'anyOf',
      constraint: metadata.constraint,
      rules: inspectedRules as Array<RuleInspection<F, C>>,
    }
  }

  if (metadata.kind === 'eitherOf') {
    const inspectedBranches = Object.fromEntries(
      Object.entries(metadata.branches).map(([branchName, branchRules]) => [
        branchName,
        branchRules.map((innerRule) => inspectRule(innerRule)),
      ]),
    ) as Record<string, Array<RuleInspection<F, C> | undefined>>

    if (
      Object.values(inspectedBranches).some((branchRules) =>
        branchRules.some((entry) => entry === undefined),
      )
    ) {
      return undefined
    }

    return {
      kind: 'eitherOf',
      groupName: metadata.groupName,
      constraint: metadata.constraint,
      branches: inspectedBranches as Record<
        string,
        Array<RuleInspection<F, C>>
      >,
    }
  }

  if (metadata.kind === 'custom') {
    return {
      kind: 'custom',
      type: rule.type,
      constraint: metadata.constraint,
      targets: [...rule.targets],
      sources: [...rule.sources],
    }
  }

  return undefined
}

export function getInternalRuleOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  metadata: InternalRuleMetadata<F, C> | undefined,
): InternalRuleMetadataWithOptions<F, C>['options'] | undefined {
  if (!metadata || !('options' in metadata)) {
    return undefined
  }

  return metadata.options
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
      metadata.rules.flatMap(
        (innerRule) => getGraphSourceInfo(innerRule).ordering,
      ),
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

  if (metadata?.kind === 'eitherOf') {
    const branchRules = getBranchRules(metadata.branches)
    const ordering = uniqueFields(
      branchRules.flatMap(
        (innerRule) => getGraphSourceInfo(innerRule).ordering,
      ),
    )
    const orderingSet = new Set(ordering)
    const informational = uniqueFields(
      branchRules
        .flatMap((innerRule) => getGraphSourceInfo(innerRule).informational)
        .filter((field) => !orderingSet.has(field)),
    )

    return {
      ordering,
      informational,
    }
  }

  if (metadata?.kind === 'custom' && metadata.constraint === 'fair') {
    return {
      ordering: [],
      informational: [...rule.sources],
    }
  }

  return {
    ordering: [...rule.sources],
    informational: [],
  }
}

function getSourceFields<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(source: InternalSource<F, C>): Array<keyof F & string> {
  const checkField = getSourceField(source)
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
>(source: Source<F, C>): string {
  if (typeof source === 'string') {
    return source
  }

  return getCheckField(source) ?? 'condition'
}

function isSourceActive<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
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

function isRuleOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(value: unknown): value is RuleOptions<F, C> {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('reason' in value || 'trace' in value)
  )
}

function uniqueFields<F extends Record<string, FieldDef>>(
  fields: Array<keyof F & string>,
): Array<keyof F & string> {
  return [...new Set(fields)]
}

export function getRuleConstraint<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: Rule<F, C>): RuleConstraint {
  const metadata = getInternalRuleMetadata(rule)

  if (metadata?.kind === 'fairWhen') {
    return 'fair'
  }

  if (metadata?.kind === 'anyOf') {
    return metadata.constraint
  }

  if (metadata?.kind === 'eitherOf') {
    return metadata.constraint
  }

  if (metadata?.kind === 'custom') {
    return metadata.constraint
  }

  return 'enabled'
}

export function isFairRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: Rule<F, C>): boolean {
  return getRuleConstraint(rule) === 'fair'
}

export function isGateRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: Rule<F, C>): boolean {
  return !isFairRule(rule)
}

/**
 * Advanced escape hatch for defining custom low-level rules.
 *
 * Prefer the built-in factories (`enabledWhen`, `fairWhen`, `disables`,
 * `requires`, `oneOf`, `anyOf`, and `eitherOf`) unless you truly need custom evaluation
 * behavior. `defineRule()` is intended for power users who need to plug a rule
 * directly into Umpire's evaluation pipeline while still participating in
 * graphing, composite helpers, and `challenge()`.
 *
 * `defineRule()` supports custom rule `type` labels and `constraint`
 * classification, but it does not expose a public API for defining new
 * internal rule kinds.
 *
 * @example
 * ```ts
 * const socketFair = defineRule({
 *   type: 'socketFair',
 *   targets: ['motherboard'],
 *   sources: ['cpu'],
 *   constraint: 'fair',
 *   evaluate(values) {
 *     const matches = values.cpu === values.motherboard
 *
 *     return new Map([
 *       ['motherboard', {
 *         enabled: true,
 *         fair: matches,
 *         reason: matches ? null : 'Selected motherboard no longer matches the CPU socket',
 *       }],
 *     ])
 *   },
 * })
 * ```
 */
export function defineRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(config: DefineRuleConfig<F, C>): Rule<F, C> {
  const rule: InternalRuleCarrier<F, C> = {
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

function branchHasSatisfiedField<F extends Record<string, FieldDef>>(
  branchFields: Array<keyof F & string>,
  values: FieldValues<F> | undefined,
  fields?: F,
): boolean {
  if (!values) {
    return false
  }

  return branchFields.some((field) =>
    isSatisfied(values[field], fields?.[field]),
  )
}

function warnAmbiguousOneOf(groupName: string, branchNames: string[]): void {
  if (!shouldWarnInDev()) {
    return
  }

  console.warn(
    `[@umpire/core] oneOf("${groupName}") is ambiguous; falling back to the first satisfied branch (${branchNames[0]}).`,
  )
}

export function resolveOneOfState<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  BranchName extends string = string,
>(
  groupName: string,
  branches: OneOfBranches<F>,
  values: FieldValues<F>,
  prev: FieldValues<F> | undefined,
  activeBranch: OneOfOptions<F, C, BranchName>['activeBranch'],
  fields?: F,
  conditions?: C,
): OneOfResolution {
  const branchNames = Object.keys(branches)
  const branchStates = Object.fromEntries(
    branchNames.map((branchName) => [
      branchName,
      {
        fields: [...branches[branchName]],
        anySatisfied: branchHasSatisfiedField(
          branches[branchName],
          values,
          fields,
        ),
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
      throw new Error(
        `[@umpire/core] Unknown active branch "${resolvedBranch}" for oneOf("${groupName}")`,
      )
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
  field: FieldSelector<F>,
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
          : resolveReason(
              options?.reason,
              values,
              conditions,
              'condition not met',
            ),
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
  field: FieldSelector<F>,
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
  source: SourceInput<F, C>,
  targets: Array<FieldSelector<F>>,
  options?: RuleOptions<F, C>,
): Rule<F, C> {
  const resolvedSource = normalizeSource(source)
  const resolvedTargets = targets.map((target) => getFieldNameOrThrow(target))
  const defaultReason =
    typeof resolvedSource === 'string'
      ? `overridden by ${resolvedSource}`
      : `overridden by ${getSourceLabel(resolvedSource)}`

  const rule: InternalRuleCarrier<F, C> = {
    type: 'disables',
    targets: resolvedTargets,
    sources: getSourceFields(resolvedSource),
    evaluate(values, conditions, _prev, fields) {
      const active = isSourceActive(resolvedSource, values, conditions, fields)

      return createResultMap(resolvedTargets, () => ({
        enabled: !active,
        reason: active
          ? resolveReason(options?.reason, values, conditions, defaultReason)
          : null,
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
): Rule<F, C> {
  const target = getFieldNameOrThrow(field)
  const maybeOptions = deps[deps.length - 1]
  const options = isRuleOptions<F, C>(maybeOptions) ? maybeOptions : undefined
  const dependencies: Array<Source<F, C>> = (
    options ? deps.slice(0, -1) : deps
  ).map((dependency) => normalizeSource(dependency as SourceInput<F, C>))

  if (dependencies.length === 0) {
    throw new Error(
      `[@umpire/core] requires("${target}") requires at least one dependency`,
    )
  }

  const rule: InternalRuleCarrier<F, C> = {
    type: 'requires',
    targets: [target],
    sources: uniqueFields(
      dependencies.flatMap((dependency) => getSourceFields(dependency)),
    ),
    evaluate(values, conditions, _prev, fields, availability) {
      let reason: string | null = null
      const reasons: string[] = []

      for (const dependency of dependencies) {
        const passed =
          typeof dependency === 'string'
            ? isSatisfied(values[dependency], fields?.[dependency]) &&
              (availability?.[dependency]?.enabled ?? true) &&
              (availability?.[dependency]?.fair ?? true)
            : dependency(values, conditions)

        if (passed) {
          continue
        }

        const fallback =
          typeof dependency === 'string'
            ? `requires ${dependency}`
            : `required condition not met`

        const resolvedReason = resolveReason(
          options?.reason,
          values,
          conditions,
          fallback,
        )

        if (reason === null) {
          reason = resolvedReason
        }

        reasons.push(resolvedReason)
      }

      return createResultMap([target], () => ({
        enabled: reasons.length === 0,
        reason,
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
  B extends OneOfBranchesInput<F> = OneOfBranchesInput<F>,
>(
  groupName: string,
  branches: B,
  options?: OneOfOptions<F, C, keyof B & string>,
): Rule<F, C> {
  const resolvedBranches = normalizeBranches(branches)
  const seenFields = new Set<string>()
  const branchNames = Object.keys(resolvedBranches)

  if (branchNames.length === 0) {
    throw new Error(
      `[@umpire/core] oneOf("${groupName}") must include at least one branch`,
    )
  }

  for (const branchName of branchNames) {
    const fields = resolvedBranches[branchName]

    if (fields.length === 0) {
      throw new Error(
        `[@umpire/core] oneOf("${groupName}") branch "${branchName}" must not be empty`,
      )
    }

    for (const field of fields) {
      if (seenFields.has(field)) {
        throw new Error(
          `[@umpire/core] oneOf("${groupName}") field "${field}" appears in multiple branches`,
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
      `[@umpire/core] Unknown active branch "${options.activeBranch}" for oneOf("${groupName}")`,
    )
  }

  const targets = branchNames.flatMap(
    (branchName) => resolvedBranches[branchName],
  )

  const rule: InternalRuleCarrier<F, C> = {
    type: 'oneOf',
    targets,
    sources: uniqueFields([...targets]),
    evaluate(values, conditions, prev, fields) {
      const resolution = resolveOneOfState(
        groupName,
        resolvedBranches,
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
        const inActiveBranch =
          resolvedBranches[resolution.activeBranch as string].includes(target)
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
    branches: resolvedBranches,
    options,
  }

  return rule
}

export function anyOf<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(...rules: Rule<F, C>[]): Rule<F, C> {
  if (rules.length === 0) {
    throw new Error('[@umpire/core] anyOf() requires at least one rule')
  }

  const { targets, sources, constraint } = resolveCompositeRuleShape(
    'anyOf()',
    rules,
  )

  const rule: InternalRuleCarrier<F, C> = {
    type: 'anyOf',
    targets,
    sources,
    evaluate(values, conditions, prev, fields, availability) {
      const evaluations = rules.map((rule) =>
        rule.evaluate(values, conditions, prev, fields, availability),
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
>(groupName: string, branches: EitherOfBranches<F, C>): Rule<F, C> {
  const branchNames = Object.keys(branches)

  if (branchNames.length === 0) {
    throw new Error(
      `[@umpire/core] eitherOf("${groupName}") must include at least one branch`,
    )
  }

  for (const branchName of branchNames) {
    if (branches[branchName].length === 0) {
      throw new Error(
        `[@umpire/core] eitherOf("${groupName}") branch "${branchName}" must not be empty`,
      )
    }
  }

  const rules = getBranchRules(branches)
  const label = `eitherOf("${groupName}")`
  const { targets, sources, constraint } = resolveCompositeRuleShape(
    label,
    rules,
  )

  const rule: InternalRuleCarrier<F, C> = {
    type: 'eitherOf',
    targets,
    sources,
    evaluate(values, conditions, prev, fields, availability) {
      const branchEvaluations = Object.fromEntries(
        branchNames.map((branchName) => [
          branchName,
          branches[branchName].map((branchRule) =>
            branchRule.evaluate(values, conditions, prev, fields, availability),
          ),
        ]),
      ) as Record<string, Array<Map<string, RuleEvaluation>>>

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
  validator: FieldValidator<NonNullable<V>>,
): Predicate<F, C> {
  const target = getFieldNameOrThrow(field)
  const namedCheckMetadata = isNamedCheckValidator(validator)
    ? cloneNamedCheckMetadata(validator)
    : undefined

  const predicate = ((values: FieldValues<F>) => {
    const value = values[target]

    if (value == null) {
      return false
    }

    return runFieldValidator(validator, value as NonNullable<V>)
  }) as Predicate<F, C>

  predicate._checkField = target

  if (namedCheckMetadata) {
    predicate._namedCheck = namedCheckMetadata
  }

  return predicate
}

/**
 * Returns typed versions of all rule factories, narrowed to your field and
 * condition types. Purely a type-level convenience — zero runtime overhead.
 *
 * ```ts
 * const { enabledWhen, requires, eitherOf } = createRules<typeof fields, MyConditions>()
 * // Predicate callbacks now have typed conditions automatically
 * ```
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
