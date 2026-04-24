import {
  evaluate,
  evaluateRuleForField,
  indexRulesByTarget,
  indexRulesByTargetPhase,
} from './evaluator.js'
import { isEmptyPresent } from './emptiness.js'
import {
  getFieldBuilderDef,
  getFieldBuilderName,
  getFieldBuilderRules,
  isFieldBuilder,
} from './field.js'
import type { FieldInput, NormalizeFields } from './field.js'
import { foulMap } from './foul-map.js'
import {
  buildGraph,
  detectCycles,
  exportGraph,
  topologicalSort,
} from './graph.js'
import {
  enabledWhen,
  fairWhen,
  getGraphSourceInfo,
  getInternalRuleMetadata,
  getInternalRuleOptions,
  isFairRule,
  cloneRuleInspection,
  inspectRule,
  type InternalRuleMetadata,
  getSourceField,
  requires,
  resolveOneOfState,
} from './rules.js'
import { isSatisfied } from './satisfaction.js'
import {
  normalizeValidationEntry,
  runValidationEntry,
  type NormalizedValidationEntry,
} from './validation.js'
import type {
  AvailabilityMap,
  ChallengeDirectReason,
  ChallengeTrace,
  ChallengeTraceAttachment,
  FieldDef,
  FieldValues,
  Foul,
  InputValues,
  Rule,
  RuleEntry,
  RuleEvaluation,
  RuleTraceAttachment,
  ScorecardOptions,
  ScorecardResult,
  Umpire,
  UmpireGraph,
  ValidationMap,
} from './types.js'

const EMPTY_CONDITIONS = Object.freeze({}) as Record<string, unknown>

function createEmptyConditions<C extends Record<string, unknown>>(
  conditions: C | undefined,
): C {
  return (conditions ?? EMPTY_CONDITIONS) as C
}

type NormalizedValidationMap<F extends Record<string, FieldDef>> = Partial<{
  [K in keyof F & string]: NormalizedValidationEntry
}>

function getChangedFields<F extends Record<string, FieldDef>>(
  fieldNames: Array<keyof F & string>,
  before: { values: FieldValues<F> } | undefined,
  after: { values: FieldValues<F> },
) {
  if (!before) {
    return []
  }

  return fieldNames.filter(
    (field) => !Object.is(before.values[field], after.values[field]),
  )
}

function normalizeValidators<F extends Record<string, FieldDef>>(
  fields: F,
  validators: ValidationMap<F> | undefined,
): NormalizedValidationMap<F> {
  const normalized = {} as NormalizedValidationMap<F>

  if (!validators) {
    return normalized
  }

  const fieldNames = new Set(Object.keys(fields))

  for (const [field, entry] of Object.entries(validators) as Array<
    [keyof F & string, unknown]
  >) {
    if (entry === undefined) {
      continue
    }

    if (!fieldNames.has(field)) {
      throw new Error(
        `[@umpire/core] Unknown field "${field}" referenced by validators`,
      )
    }

    const normalizedEntry = normalizeValidationEntry(entry)

    if (!normalizedEntry) {
      throw new Error(
        `[@umpire/core] Invalid validator configured for field "${field}"`,
      )
    }

    normalized[field] = normalizedEntry
  }

  return normalized
}

function buildFieldEdgeLookup<F extends Record<string, FieldDef>>(
  graph: UmpireGraph,
  fieldNames: Array<keyof F & string>,
) {
  const incomingByField = {} as Record<
    keyof F & string,
    Array<{ field: string; type: string }>
  >
  const outgoingByField = {} as Record<
    keyof F & string,
    Array<{ field: string; type: string }>
  >

  for (const field of fieldNames) {
    incomingByField[field] = []
    outgoingByField[field] = []
  }

  for (const edge of graph.edges) {
    incomingByField[edge.to as keyof F & string].push({
      field: edge.from,
      type: edge.type,
    })
    outgoingByField[edge.from as keyof F & string].push({
      field: edge.to,
      type: edge.type,
    })
  }

  return {
    incomingByField,
    outgoingByField,
  }
}

function getRuleTraceAttachments<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  metadata: InternalRuleMetadata<F, C> | undefined,
): RuleTraceAttachment<FieldValues<F>, C>[] {
  const trace = getInternalRuleOptions(metadata)?.trace

  if (!trace) {
    return []
  }

  return Array.isArray(trace) ? trace : [trace]
}

function inspectRuleTraceAttachments<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  attachments: RuleTraceAttachment<FieldValues<F>, C>[],
  values: FieldValues<F>,
  conditions: C,
  prev: FieldValues<F> | undefined,
): ChallengeTraceAttachment[] | undefined {
  const trace = attachments.flatMap((attachment) => {
    const result = attachment.inspect(values, conditions, prev)

    if (!result) {
      return []
    }

    return [
      {
        kind: attachment.kind,
        id: attachment.id,
        ...result,
      },
    ]
  })

  return trace.length > 0 ? trace : undefined
}

function withRuleTrace<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  entry: ChallengeDirectReason,
  metadata: InternalRuleMetadata<F, C> | undefined,
  values: FieldValues<F>,
  conditions: C,
  prev: FieldValues<F> | undefined,
): ChallengeDirectReason {
  const trace = inspectRuleTraceAttachments(
    getRuleTraceAttachments(metadata),
    values,
    conditions,
    prev,
  )

  return trace ? { ...entry, trace } : entry
}

function didRulePass<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: Rule<F, C>, evaluation: RuleEvaluation): boolean {
  return isFairRule(rule) ? evaluation.fair !== false : evaluation.enabled
}

function buildRuleEntries<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rules: Rule<F, C>[],
): {
  entries: Array<RuleEntry<F, C>>
  entryByRule: Map<Rule<F, C>, RuleEntry<F, C>>
} {
  const seenIds = new Map<string, number>()
  const entryByRule = new Map<Rule<F, C>, RuleEntry<F, C>>()

  const entries = rules.map((rule, index) => {
    const inspection = inspectRule(rule)
    const baseId = inspection
      ? [inspection.kind, rule.targets.join(','), rule.sources.join(',')].join(
          ':',
        )
      : `uninspectable:${index}`
    const seenCount = seenIds.get(baseId) ?? 0

    seenIds.set(baseId, seenCount + 1)

    const entry = {
      index,
      id: seenCount === 0 ? baseId : `${baseId}#${seenCount + 1}`,
      inspection,
    }

    entryByRule.set(rule, entry)
    return entry
  })

  return { entries, entryByRule }
}

function cloneRuleEntry<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(entry: RuleEntry<F, C>): RuleEntry<F, C> {
  return {
    ...entry,
    inspection:
      entry.inspection === undefined
        ? undefined
        : cloneRuleInspection(entry.inspection),
  }
}

function normalizeConfig<
  F extends Record<string, FieldInput>,
  C extends Record<string, unknown>,
>(
  rawFields: F,
  explicitRules: Rule<NormalizeFields<F>, C>[],
): {
  fields: NormalizeFields<F>
  rules: Rule<NormalizeFields<F>, C>[]
} {
  const normalizedFields = {} as NormalizeFields<F>
  const attachedRules: Rule<NormalizeFields<F>, C>[] = []

  for (const [fieldKey, rawField] of Object.entries(rawFields) as Array<
    [keyof F & string, F[keyof F & string]]
  >) {
    if (!isFieldBuilder(rawField)) {
      normalizedFields[fieldKey] =
        rawField as unknown as NormalizeFields<F>[keyof F & string]
      continue
    }

    const namedField = getFieldBuilderName(rawField)
    if (namedField && namedField !== fieldKey) {
      throw new Error(
        `[@umpire/core] Named field builder "${namedField}" does not match field key "${fieldKey}"`,
      )
    }

    normalizedFields[fieldKey] = getFieldBuilderDef(
      rawField,
    ) as NormalizeFields<F>[keyof F & string]

    for (const attachedRule of getFieldBuilderRules(rawField)) {
      if (attachedRule.kind === 'enabledWhen') {
        attachedRules.push(
          enabledWhen<NormalizeFields<F>, C>(
            fieldKey,
            attachedRule.predicate as Parameters<
              typeof enabledWhen<NormalizeFields<F>, C>
            >[1],
            attachedRule.options as Parameters<
              typeof enabledWhen<NormalizeFields<F>, C>
            >[2],
          ),
        )
        continue
      }

      if (attachedRule.kind === 'fairWhen') {
        attachedRules.push(
          fairWhen<NormalizeFields<F>, C>(
            fieldKey,
            attachedRule.predicate as Parameters<
              typeof fairWhen<NormalizeFields<F>, C>
            >[1],
            attachedRule.options as Parameters<
              typeof fairWhen<NormalizeFields<F>, C>
            >[2],
          ),
        )
        continue
      }

      const dependency = attachedRule.dependency as keyof NormalizeFields<F> &
        string
      const options = attachedRule.options as
        | Parameters<typeof requires<NormalizeFields<F>, C>>[2]
        | undefined

      attachedRules.push(
        options
          ? requires<NormalizeFields<F>, C>(fieldKey, dependency, options)
          : requires<NormalizeFields<F>, C>(fieldKey, dependency),
      )
    }
  }

  return {
    fields: normalizedFields,
    rules: [...attachedRules, ...explicitRules],
  }
}

function describeRuleForField<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rule: Rule<F, C>,
  field: keyof F & string,
  fields: F,
  values: FieldValues<F>,
  conditions: C,
  prev: FieldValues<F> | undefined,
  availability: AvailabilityMap<F>,
  baseRuleCache: Map<Rule<F, C>, Map<string, RuleEvaluation>>,
  ruleEntry?: RuleEntry<F, C>,
): ChallengeTrace['directReasons'][number] {
  const metadata = getInternalRuleMetadata(rule)
  const evaluation = evaluateRuleForField(
    rule,
    field,
    fields,
    values,
    conditions,
    prev,
    availability,
    baseRuleCache,
  )

  if (metadata?.kind === 'enabledWhen') {
    const source = getSourceField(metadata.predicate)

    return withRuleTrace(
      {
        rule: 'enabledWhen',
        ruleIndex: ruleEntry?.index,
        ruleId: ruleEntry?.id,
        passed: evaluation.enabled,
        reason: evaluation.reason,
        predicate: metadata.predicate.toString(),
        source,
        sourceValue: source ? values[source] : undefined,
      },
      metadata,
      values,
      conditions,
      prev,
    )
  }

  if (metadata?.kind === 'disables') {
    const sourceField = getSourceField(metadata.source)
    const sourceSatisfied =
      typeof metadata.source === 'string'
        ? isSatisfied(values[metadata.source], fields[metadata.source])
        : metadata.source(values, conditions)
    const source = sourceField ?? metadata.source.toString()

    return withRuleTrace(
      {
        rule: 'disables',
        ruleIndex: ruleEntry?.index,
        ruleId: ruleEntry?.id,
        passed: evaluation.enabled,
        reason: evaluation.reason,
        source,
        sourceValue: sourceField ? values[sourceField] : sourceSatisfied,
        sourceSatisfied,
      },
      metadata,
      values,
      conditions,
      prev,
    )
  }

  if (metadata?.kind === 'fairWhen') {
    return withRuleTrace(
      {
        rule: 'fair',
        ruleIndex: ruleEntry?.index,
        ruleId: ruleEntry?.id,
        passed: evaluation.fair !== false,
        reason: evaluation.reason,
        predicate: metadata.predicate.toString(),
        value: values[field],
      },
      metadata,
      values,
      conditions,
      prev,
    )
  }

  if (metadata?.kind === 'requires') {
    const dependencies = metadata.dependencies.map((dependency) => {
      const dependencyField = getSourceField(dependency)

      if (typeof dependency !== 'string') {
        return {
          dependency: dependencyField ?? dependency.toString(),
          dependencyValue: dependencyField
            ? values[dependencyField]
            : undefined,
          satisfied: dependency(values, conditions),
        }
      }

      return {
        dependency,
        satisfied: isSatisfied(values[dependency], fields[dependency]),
        dependencyEnabled: availability[dependency].enabled,
        dependencyFair: availability[dependency].fair,
      }
    })

    return withRuleTrace(
      {
        rule: 'requires',
        ruleIndex: ruleEntry?.index,
        ruleId: ruleEntry?.id,
        passed: evaluation.enabled,
        reason: evaluation.reason,
        dependency: dependencies[0]?.dependency,
        dependencyValue: dependencies[0]?.dependencyValue,
        satisfied: dependencies[0]?.satisfied,
        dependencyEnabled: dependencies[0]?.dependencyEnabled,
        dependencyFair: dependencies[0]?.dependencyFair,
        dependencies,
      },
      metadata,
      values,
      conditions,
      prev,
    )
  }

  if (metadata?.kind === 'oneOf') {
    const resolution = resolveOneOfState(
      metadata.groupName,
      metadata.branches,
      values,
      prev,
      metadata.options?.activeBranch,
      fields,
      conditions,
    )
    const thisBranch =
      Object.entries(metadata.branches).find(([, branchFields]) =>
        branchFields.includes(field),
      )?.[0] ?? null

    return withRuleTrace(
      {
        rule: 'oneOf',
        ruleIndex: ruleEntry?.index,
        ruleId: ruleEntry?.id,
        passed: evaluation.enabled,
        reason: evaluation.reason,
        group: metadata.groupName,
        activeBranch: resolution.activeBranch,
        thisBranch,
      },
      metadata,
      values,
      conditions,
      prev,
    )
  }

  if (metadata?.kind === 'anyOf') {
    const inner: ChallengeTrace['directReasons'] = metadata.rules.map(
      (innerRule) =>
        describeRuleForField(
          innerRule,
          field,
          fields,
          values,
          conditions,
          prev,
          availability,
          baseRuleCache,
          ruleEntry,
        ),
    )

    return {
      rule: 'anyOf',
      ruleIndex: ruleEntry?.index,
      ruleId: ruleEntry?.id,
      passed: didRulePass(rule, evaluation),
      reason: evaluation.reason,
      inner,
    }
  }

  if (metadata?.kind === 'eitherOf') {
    const branches = Object.fromEntries(
      Object.entries(metadata.branches).map(([branchName, branchRules]) => {
        const inner = branchRules.map((innerRule) =>
          describeRuleForField(
            innerRule,
            field,
            fields,
            values,
            conditions,
            prev,
            availability,
            baseRuleCache,
            ruleEntry,
          ),
        )

        return [
          branchName,
          {
            passed: inner.every((entry) => entry.passed),
            inner,
          },
        ]
      }),
    ) as Record<
      string,
      { passed: boolean; inner: ChallengeTrace['directReasons'] }
    >

    const matchedBranches = Object.entries(branches)
      .filter(([, branch]) => branch.passed)
      .map(([branchName]) => branchName)

    return {
      rule: 'eitherOf',
      ruleIndex: ruleEntry?.index,
      ruleId: ruleEntry?.id,
      passed: didRulePass(rule, evaluation),
      reason: evaluation.reason,
      group: metadata.groupName,
      constraint: metadata.constraint,
      matchedBranches,
      branches,
    }
  }

  return withRuleTrace(
    {
      rule: rule.type,
      ruleIndex: ruleEntry?.index,
      ruleId: ruleEntry?.id,
      passed: didRulePass(rule, evaluation),
      reason: evaluation.reason,
    },
    metadata,
    values,
    conditions,
    prev,
  )
}

function collectFailedDependenciesForRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rule: Rule<F, C>,
  field: keyof F & string,
  fields: F,
  values: FieldValues<F>,
  conditions: C,
  prev: FieldValues<F> | undefined,
  availability: AvailabilityMap<F>,
  baseRuleCache: Map<Rule<F, C>, Map<string, RuleEvaluation>>,
): Array<keyof F & string> {
  const metadata = getInternalRuleMetadata(rule)

  if (metadata?.kind === 'anyOf') {
    const evaluation = evaluateRuleForField(
      rule,
      field,
      fields,
      values,
      conditions,
      prev,
      availability,
      baseRuleCache,
    )

    if (
      metadata.constraint === 'fair'
        ? evaluation.fair !== false
        : evaluation.enabled
    ) {
      return []
    }

    const failedDependencies: Array<keyof F & string> = []

    for (const innerRule of metadata.rules) {
      failedDependencies.push(
        ...collectFailedDependenciesForRule(
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

    return failedDependencies
  }

  if (metadata?.kind === 'eitherOf') {
    const evaluation = evaluateRuleForField(
      rule,
      field,
      fields,
      values,
      conditions,
      prev,
      availability,
      baseRuleCache,
    )

    if (
      metadata.constraint === 'fair'
        ? evaluation.fair !== false
        : evaluation.enabled
    ) {
      return []
    }

    const failedDependencies: Array<keyof F & string> = []

    for (const branchRules of Object.values(metadata.branches)) {
      for (const innerRule of branchRules) {
        failedDependencies.push(
          ...collectFailedDependenciesForRule(
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
    }

    return failedDependencies
  }

  if (metadata?.kind !== 'requires') {
    return []
  }

  const evaluation = evaluateRuleForField(
    rule,
    field,
    fields,
    values,
    conditions,
    prev,
    availability,
    baseRuleCache,
  )

  if (evaluation.enabled) {
    return []
  }

  return metadata.dependencies.filter(
    (dependency): dependency is keyof F & string => {
      if (typeof dependency !== 'string') {
        return false
      }

      const dependencySatisfied = isSatisfied(
        values[dependency],
        fields[dependency],
      )
      const dependencyAvailability = availability[dependency]

      return !(
        dependencySatisfied &&
        dependencyAvailability.enabled &&
        dependencyAvailability.fair
      )
    },
  )
}

function describeCausedBy<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  field: keyof F & string,
  fields: F,
  rulesByTarget: Map<string, Rule<F, C>[]>,
  values: FieldValues<F>,
  conditions: C,
  prev: FieldValues<F> | undefined,
  availability: AvailabilityMap<F>,
  baseRuleCache: Map<Rule<F, C>, Map<string, RuleEvaluation>>,
  ruleEntryByRule: Map<Rule<F, C>, RuleEntry<F, C>>,
): ChallengeTrace['transitiveDeps'][number]['causedBy'] {
  const causedBy: ChallengeTrace['transitiveDeps'][number]['causedBy'] = []

  for (const rule of rulesByTarget.get(field) ?? []) {
    const entry = describeRuleForField(
      rule,
      field,
      fields,
      values,
      conditions,
      prev,
      availability,
      baseRuleCache,
      ruleEntryByRule.get(rule),
    )

    if (entry.passed) {
      continue
    }

    const { rule: ruleName, ...details } = entry
    causedBy.push({
      rule: ruleName,
      ...details,
    })
  }

  return causedBy
}

function buildTransitiveDeps<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  startField: keyof F & string,
  fields: F,
  rulesByTarget: Map<string, Rule<F, C>[]>,
  values: FieldValues<F>,
  conditions: C,
  prev: FieldValues<F> | undefined,
  availability: AvailabilityMap<F>,
  baseRuleCache: Map<Rule<F, C>, Map<string, RuleEvaluation>>,
  ruleEntryByRule: Map<Rule<F, C>, RuleEntry<F, C>>,
) {
  const visited = new Set<string>()
  const result: ChallengeTrace['transitiveDeps'] = []

  const visit = (field: keyof F & string) => {
    for (const rule of rulesByTarget.get(field) ?? []) {
      for (const dependency of collectFailedDependenciesForRule(
        rule,
        field,
        fields,
        values,
        conditions,
        prev,
        availability,
        baseRuleCache,
      )) {
        const dependencyAvailability = availability[dependency]

        if (visited.has(dependency)) {
          continue
        }

        visited.add(dependency)
        result.push({
          field: dependency,
          enabled: dependencyAvailability.enabled,
          fair: dependencyAvailability.fair,
          reason: dependencyAvailability.reason,
          causedBy: describeCausedBy(
            dependency,
            fields,
            rulesByTarget,
            values,
            conditions,
            prev,
            availability,
            baseRuleCache,
            ruleEntryByRule,
          ),
        })

        if (!dependencyAvailability.enabled || !dependencyAvailability.fair) {
          visit(dependency)
        }
      }
    }
  }

  visit(startField)

  return result
}

type StructuralRequirement<Field extends string = string> = {
  target: Field
  dependency: Field
}

type StaticOneOfGroup<Field extends string = string> = {
  groupName: string
  branchByField: Map<Field, string>
}

function getStructuralRequirementsFromRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: Rule<F, C>): Array<StructuralRequirement<keyof F & string>> {
  const metadata = getInternalRuleMetadata(rule)

  if (metadata?.kind !== 'requires') {
    return []
  }

  return metadata.dependencies.flatMap((dependency) => {
    const dependencyField =
      typeof dependency === 'string' ? dependency : getSourceField(dependency)

    if (!dependencyField) {
      return []
    }

    return [
      {
        target: rule.targets[0],
        dependency: dependencyField,
      },
    ]
  })
}

function getFieldSourceDisableTargetsFromRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rule: Rule<F, C>,
): { source: keyof F & string; targets: Array<keyof F & string> } | null {
  const metadata = getInternalRuleMetadata(rule)

  // Only a plain field-name source proves the hard contradiction we care
  // about here. Predicates may preserve source-field metadata via check(),
  // but they do not mean "disabled whenever this field is satisfied".
  if (metadata?.kind !== 'disables' || typeof metadata.source !== 'string') {
    return null
  }

  return {
    source: metadata.source,
    targets: [...rule.targets],
  }
}

function getStaticOneOfGroupFromRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rule: Rule<F, C>): StaticOneOfGroup<keyof F & string> | null {
  const metadata = getInternalRuleMetadata(rule)

  if (
    metadata?.kind !== 'oneOf' ||
    typeof metadata.options?.activeBranch === 'function'
  ) {
    return null
  }

  const branchByField = new Map<keyof F & string, string>()

  for (const [branchName, branchFields] of Object.entries(metadata.branches)) {
    for (const field of branchFields) {
      branchByField.set(field, branchName)
    }
  }

  return {
    groupName: metadata.groupName,
    branchByField,
  }
}

/**
 * Rejects a small set of rule combinations that are structurally impossible.
 *
 * This is intentionally a conservative creation-time validation pass, not a
 * general satisfiability solver. It only looks for contradictions we can prove
 * from static rule structure alone, without evaluating arbitrary values,
 * conditions, or custom logic.
 *
 * Today that means two hard-error cases:
 * - `requires(target, dependency)` together with `disables(dependency, [target])`
 * - `requires(target, dependency)` where `target` and `dependency` belong to
 *   different branches of the same non-dynamic `oneOf()` group
 *
 * Those cases are safe to reject because, under Umpire's semantics, there is
 * no state in which the target can become enabled.
 *
 * This pass intentionally excludes anything that would require interpreting
 * broader predicate meaning rather than explicit field structure, including:
 * - predicate-backed `disables()` sources, even when they preserve a field via
 *   `check()`, because that metadata does not mean "whenever this field is
 *   satisfied"
 * - dynamic `oneOf({ activeBranch })` functions, because runtime conditions can
 *   legitimately reopen states that look contradictory from static structure
 * - `anyOf()`, `eitherOf()`, and custom rules, because they would require
 *   deeper semantic analysis than this validator is meant to provide
 *
 * Future additions here should follow the same bar: only add checks that are
 * provably impossible by construction, with no need to reason about runtime
 * data beyond the structural guarantees encoded in the rule definitions.
 */
function validateStructuralContradictions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(rules: Rule<F, C>[]): void {
  const requirements: Array<StructuralRequirement<keyof F & string>> = []
  const disablesBySource = new Map<keyof F & string, Set<keyof F & string>>()
  const staticOneOfGroups: Array<StaticOneOfGroup<keyof F & string>> = []

  for (const rule of rules) {
    requirements.push(...getStructuralRequirementsFromRule(rule))

    const disableTargets = getFieldSourceDisableTargetsFromRule(rule)
    if (disableTargets) {
      const targets =
        disablesBySource.get(disableTargets.source) ??
        new Set<keyof F & string>()

      for (const target of disableTargets.targets) {
        targets.add(target)
      }

      disablesBySource.set(disableTargets.source, targets)
    }

    const staticOneOfGroup = getStaticOneOfGroupFromRule(rule)
    if (staticOneOfGroup) {
      staticOneOfGroups.push(staticOneOfGroup)
    }
  }

  for (const { target, dependency } of requirements) {
    if (disablesBySource.get(dependency)?.has(target)) {
      throw new Error(
        `[@umpire/core] Contradictory rules: "${target}" can never be enabled because it requires "${dependency}", but is disabled whenever "${dependency}" is satisfied`,
      )
    }

    for (const group of staticOneOfGroups) {
      const targetBranch = group.branchByField.get(target)
      const dependencyBranch = group.branchByField.get(dependency)

      if (
        !targetBranch ||
        !dependencyBranch ||
        targetBranch === dependencyBranch
      ) {
        continue
      }

      throw new Error(
        `[@umpire/core] Contradictory rules: "${target}" can never be enabled because it requires "${dependency}", but oneOf("${group.groupName}") places them in different branches ("${targetBranch}" and "${dependencyBranch}")`,
      )
    }
  }
}

function validateRules<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(fields: F, rules: Rule<F, C>[]): void {
  const fieldNames = new Set(Object.keys(fields))

  for (const rule of rules) {
    const metadata = getInternalRuleMetadata(rule)
    const { ordering, informational } = getGraphSourceInfo(rule)

    if (metadata?.kind === 'oneOf') {
      for (const [branchName, branchFields] of Object.entries(
        metadata.branches,
      )) {
        for (const field of branchFields) {
          if (!fieldNames.has(field)) {
            throw new Error(
              `[@umpire/core] Unknown field "${field}" in oneOf("${metadata.groupName}") branch "${branchName}"`,
            )
          }
        }
      }
    }

    for (const field of [...ordering, ...informational, ...rule.targets]) {
      if (!fieldNames.has(field)) {
        throw new Error(
          `[@umpire/core] Unknown field "${field}" referenced by ${rule.type} rule`,
        )
      }
    }
  }

  validateStructuralContradictions(rules)
}

export function umpire<
  FInput extends Record<string, FieldInput>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(config: {
  fields: FInput
  rules: Rule<NormalizeFields<FInput>, C>[]
  validators?: ValidationMap<NormalizeFields<FInput>>
}): Umpire<NormalizeFields<FInput>, C> {
  const { fields, rules } = normalizeConfig(config.fields, config.rules)
  const fieldNames = Object.keys(fields) as Array<
    keyof NormalizeFields<FInput> & string
  >
  const validators = normalizeValidators(fields, config.validators)
  const hasValidators = Object.keys(validators).length > 0

  validateRules(fields, rules)

  const graph = buildGraph(fields, rules)
  detectCycles(graph)
  const topoOrder = topologicalSort(graph, fieldNames)
  const rulesByTarget = indexRulesByTarget(rules)
  const { entries: ruleEntries, entryByRule: ruleEntryByRule } =
    buildRuleEntries(rules)
  const rulesByTargetPhase = indexRulesByTargetPhase(rulesByTarget)
  const exportedGraph = exportGraph(graph)
  const { incomingByField, outgoingByField } = buildFieldEdgeLookup(
    exportedGraph,
    fieldNames,
  )

  function exportCompiledGraph(): UmpireGraph {
    return {
      nodes: [...exportedGraph.nodes],
      edges: exportedGraph.edges.map((edge) => ({ ...edge })),
    }
  }

  function checkAvailability(
    values: FieldValues<NormalizeFields<FInput>>,
    conditions: C | undefined,
    prev: FieldValues<NormalizeFields<FInput>> | undefined,
  ) {
    return evaluate(
      fields,
      rules,
      topoOrder,
      values,
      createEmptyConditions(conditions),
      prev,
      rulesByTarget,
      rulesByTargetPhase,
    )
  }

  function attachValidationMetadata(
    values: FieldValues<NormalizeFields<FInput>>,
    availability: AvailabilityMap<NormalizeFields<FInput>>,
  ): AvailabilityMap<NormalizeFields<FInput>> {
    if (!hasValidators) {
      return availability
    }

    const validated = {} as AvailabilityMap<NormalizeFields<FInput>>

    for (const field of fieldNames) {
      const status = availability[field]
      const validator = validators[field]

      // Validation metadata only applies once a field is structurally active
      // and has a satisfied value to validate.
      if (!validator || !status.enabled || !status.satisfied) {
        validated[field] = status
        continue
      }

      const result = runValidationEntry(
        validator,
        values[field] as NonNullable<
          FieldValues<NormalizeFields<FInput>>[typeof field]
        >,
      )

      const nextStatus = { ...status, valid: result.valid }

      if (!result.valid && result.error !== undefined) {
        nextStatus.error = result.error
      }

      validated[field] = nextStatus
    }

    return validated
  }

  function recommendFouls(
    before: { values: FieldValues<NormalizeFields<FInput>>; conditions?: C },
    after: { values: FieldValues<NormalizeFields<FInput>>; conditions?: C },
  ) {
    const beforeAvailability = checkAvailability(
      before.values,
      before.conditions,
      undefined,
    )
    const afterAvailability = checkAvailability(
      after.values,
      after.conditions,
      before.values,
    )
    const recommendations: Foul<NormalizeFields<FInput>>[] = []

    for (const field of fieldNames) {
      const beforeStatus = beforeAvailability[field]
      const afterStatus = afterAvailability[field]
      const disabledTransition = beforeStatus.enabled && !afterStatus.enabled
      const foulTransition = beforeStatus.fair && afterStatus.fair === false

      if (!disabledTransition && !foulTransition) {
        continue
      }

      const currentValue = after.values[field]
      const suggestedValue = fields[field].default as
        | FieldValues<NormalizeFields<FInput>>[typeof field]
        | undefined

      if (!afterStatus.satisfied) {
        continue
      }

      if (Object.is(currentValue, suggestedValue)) {
        continue
      }

      recommendations.push({
        field,
        reason:
          afterStatus.reason ??
          (disabledTransition ? 'field disabled' : 'field fouled'),
        suggestedValue,
      })
    }

    return recommendations
  }

  function initValues(overrides?: InputValues) {
    const values = {} as FieldValues<NormalizeFields<FInput>>

    for (const field of fieldNames) {
      if (overrides && field in overrides) {
        values[field] = overrides[field] as FieldValues<
          NormalizeFields<FInput>
        >[typeof field]
        continue
      }

      values[field] = fields[field].default as FieldValues<
        NormalizeFields<FInput>
      >[typeof field]
    }

    return values
  }

  function buildChallenge(
    field: keyof NormalizeFields<FInput> & string,
    values: InputValues,
    conditions?: C,
    prev?: InputValues,
  ) {
    if (!(field in fields)) {
      throw new Error(`[@umpire/core] Unknown field "${field}"`)
    }

    const resolvedConditions = createEmptyConditions(conditions)
    const typedValues = values as FieldValues<NormalizeFields<FInput>>
    const typedPrev = prev as FieldValues<NormalizeFields<FInput>> | undefined
    const availability = checkAvailability(
      typedValues,
      resolvedConditions,
      typedPrev,
    )
    const baseRuleCache = new Map<
      Rule<NormalizeFields<FInput>, C>,
      Map<string, RuleEvaluation>
    >()
    const targetRules = rulesByTarget.get(field) ?? []
    const directReasons = targetRules.map((rule) =>
      describeRuleForField(
        rule,
        field,
        fields,
        typedValues,
        resolvedConditions,
        typedPrev,
        availability,
        baseRuleCache,
        ruleEntryByRule.get(rule),
      ),
    )

    const oneOfRule = targetRules.find((rule) => {
      const metadata = getInternalRuleMetadata(rule)
      return metadata?.kind === 'oneOf'
    })
    const oneOfMetadata = oneOfRule
      ? getInternalRuleMetadata(oneOfRule)
      : undefined
    const oneOfResolution =
      oneOfMetadata?.kind === 'oneOf'
        ? {
            group: oneOfMetadata.groupName,
            ...resolveOneOfState(
              oneOfMetadata.groupName,
              oneOfMetadata.branches,
              typedValues,
              typedPrev,
              oneOfMetadata.options?.activeBranch,
              fields,
              resolvedConditions,
            ),
          }
        : null

    return {
      field,
      enabled: availability[field].enabled,
      fair: availability[field].fair,
      directReasons,
      transitiveDeps: buildTransitiveDeps(
        field,
        fields,
        rulesByTarget,
        typedValues,
        resolvedConditions,
        typedPrev,
        availability,
        baseRuleCache,
        ruleEntryByRule,
      ),
      oneOfResolution,
    }
  }

  function buildScorecard(
    snapshot: {
      values: InputValues
      conditions?: C
    },
    options: ScorecardOptions<C> = {},
  ): ScorecardResult<NormalizeFields<FInput>, C> {
    const { before, includeChallenge = false } = options
    const typedValues = snapshot.values as FieldValues<NormalizeFields<FInput>>
    const typedPrev = before?.values as
      | FieldValues<NormalizeFields<FInput>>
      | undefined
    const structuralCheck = checkAvailability(
      typedValues,
      snapshot.conditions,
      typedPrev,
    )
    const check = attachValidationMetadata(typedValues, structuralCheck)
    const changedFields = getChangedFields(
      fieldNames,
      before as { values: FieldValues<NormalizeFields<FInput>> } | undefined,
      { values: typedValues },
    )
    const fouls = before
      ? recommendFouls(
          {
            values: before.values as FieldValues<NormalizeFields<FInput>>,
            conditions: before.conditions,
          },
          {
            values: typedValues,
            conditions: snapshot.conditions,
          },
        )
      : []
    const foulsByField = foulMap(fouls)
    const changedFieldSet = new Set(changedFields)
    const fouledFields = fouls.map((foul) => foul.field)
    const directlyFouledFields = fouledFields.filter((field) =>
      changedFieldSet.has(field),
    )
    const cascadingFields = fouledFields.filter(
      (field) => !changedFieldSet.has(field),
    )
    const cascadingFieldSet = new Set(cascadingFields)

    const scorecardFields = Object.fromEntries(
      fieldNames.map((field) => {
        const availability = check[field]
        const value = typedValues[field]
        const present = !isEmptyPresent(value)
        const scorecardField: ScorecardResult<
          NormalizeFields<FInput>,
          C
        >['fields'][typeof field] = {
          field,
          value,
          present,
          satisfied: availability.satisfied,
          enabled: availability.enabled,
          fair: availability.fair,
          required: availability.required,
          reason: availability.reason,
          reasons: availability.reasons,
          changed: changedFieldSet.has(field),
          cascaded: cascadingFieldSet.has(field),
          foul: foulsByField[field] ?? null,
          incoming: incomingByField[field],
          outgoing: outgoingByField[field],
          trace: includeChallenge
            ? buildChallenge(
                field,
                snapshot.values,
                snapshot.conditions,
                before?.values,
              )
            : undefined,
        }

        if (availability.valid !== undefined) {
          scorecardField.valid = availability.valid
        }

        if (availability.error !== undefined) {
          scorecardField.error = availability.error
        }

        return [field, scorecardField]
      }),
    ) as ScorecardResult<NormalizeFields<FInput>, C>['fields']

    return {
      check,
      graph: exportCompiledGraph(),
      fields: scorecardFields,
      transition: {
        before: before ?? null,
        changedFields,
        fouls,
        foulsByField,
        fouledFields,
        directlyFouledFields,
        cascadingFields,
      },
    }
  }

  return {
    check(values: InputValues, conditions?: C, prev?: InputValues) {
      const typedValues = values as FieldValues<NormalizeFields<FInput>>

      return attachValidationMetadata(
        typedValues,
        checkAvailability(
          typedValues,
          conditions,
          prev as FieldValues<NormalizeFields<FInput>> | undefined,
        ),
      )
    },

    play(before, after) {
      return recommendFouls(
        {
          values: before.values as FieldValues<NormalizeFields<FInput>>,
          conditions: before.conditions,
        },
        {
          values: after.values as FieldValues<NormalizeFields<FInput>>,
          conditions: after.conditions,
        },
      )
    },

    init(overrides) {
      return initValues(overrides)
    },

    scorecard(snapshot, options) {
      return buildScorecard(snapshot, options)
    },

    challenge(
      field: keyof NormalizeFields<FInput> & string,
      values: InputValues,
      conditions?: C,
      prev?: InputValues,
    ) {
      return buildChallenge(field, values, conditions, prev)
    },

    graph() {
      return exportCompiledGraph()
    },

    rules() {
      return ruleEntries.map((entry) => cloneRuleEntry(entry))
    },
  }
}
