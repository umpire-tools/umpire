import type {
  AvailabilityMap,
  ChallengeTrace,
  FieldDef,
  FieldValues,
  Foul,
  InputValues,
  Rule,
  RuleInspection,
  ScorecardResult,
  Snapshot,
  UmpireGraph,
  FieldInput,
  NormalizeFields,
} from '@umpire/core'
import { foulMap, inspectRule, isEmptyPresent } from '@umpire/core'
import {
  buildGraph,
  detectCycles,
  exportGraph,
  indexRulesByTarget as coreIndexRulesByTarget,
  isFairRule,
  normalizeConfig,
  shouldWarnInDev,
  topologicalSort,
  validateRules,
} from '@umpire/core/internal'
import type {
  AnyRule,
  AsyncRule,
  AsyncRuleEntry,
  AsyncScorecardOptions,
  Umpire,
} from './types.js'
import { toAsyncRule } from './guards.js'
import { evaluateAsync } from './evaluator.js'
import {
  attachValidationMetadataAsync,
  normalizeAnyValidators,
} from './validation.js'

function composeAbortSignals(
  internal: AbortSignal,
  external: AbortSignal,
): AbortSignal {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (AbortSignal as any).any === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (AbortSignal as any).any([internal, external])
  }

  const controller = new AbortController()

  const forward = () => {
    const reason = internal.reason ?? external.reason
    controller.abort(reason)
  }

  internal.addEventListener('abort', forward, { once: true })
  external.addEventListener('abort', forward, { once: true })

  if (internal.aborted || external.aborted) {
    forward()
  }

  return controller.signal
}

const EMPTY_CONDITIONS = Object.freeze({}) as Record<string, unknown>

function createEmptyConditions<C extends Record<string, unknown>>(
  conditions: C | undefined,
): C {
  return (conditions ?? EMPTY_CONDITIONS) as C
}

type RulePhaseBuckets<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  gateRules: AsyncRule<F, C>[]
  fairRules: AsyncRule<F, C>[]
}

function indexAsyncRulesByTargetPhase<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rulesByTarget: Map<string, AsyncRule<F, C>[]>,
): Map<string, RulePhaseBuckets<F, C>> {
  const result = new Map<string, RulePhaseBuckets<F, C>>()

  for (const [field, rules] of rulesByTarget) {
    const gateRules: AsyncRule<F, C>[] = []
    const fairRules: AsyncRule<F, C>[] = []

    for (const rule of rules) {
      if (isFairRule(rule as unknown as Rule<F, C>)) {
        fairRules.push(rule)
      } else {
        gateRules.push(rule)
      }
    }

    result.set(field, { gateRules, fairRules })
  }

  return result
}

function buildAsyncRuleEntries<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rules: AnyRule<F, C>[],
): {
  entries: AsyncRuleEntry<F, C>[]
  entryByRule: Map<AnyRule<F, C>, AsyncRuleEntry<F, C>>
} {
  const seenIds = new Map<string, number>()
  const entryByRule = new Map<AnyRule<F, C>, AsyncRuleEntry<F, C>>()

  const entries = rules.map((rule, index) => {
    const inspection = inspectRule(rule as unknown as Rule<F, C>) as
      | RuleInspection<F, C>
      | undefined
    const baseId = inspection
      ? [inspection.kind, rule.targets.join(','), rule.sources.join(',')].join(
          ':',
        )
      : `uninspectable:${index}`
    const seenCount = seenIds.get(baseId) ?? 0

    seenIds.set(baseId, seenCount + 1)

    const entry: AsyncRuleEntry<F, C> = {
      index,
      id: seenCount === 0 ? baseId : `${baseId}#${seenCount + 1}`,
      inspection,
    }

    entryByRule.set(rule, entry)
    return entry
  })

  return { entries, entryByRule }
}

function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true
  }

  if (typeof a !== 'object' || a === null) {
    return false
  }

  const record = a as Record<string, unknown>

  if (
    'fantasy-land/equals' in record &&
    typeof record['fantasy-land/equals'] === 'function'
  ) {
    return record['fantasy-land/equals'](b)
  }

  if ('equals' in record && typeof record.equals === 'function') {
    return record.equals(b)
  }

  return false
}

function getChangedFields<F extends Record<string, FieldDef>>(
  fieldNames: Array<keyof F & string>,
  before: { values: FieldValues<F> } | undefined,
  after: { values: FieldValues<F> },
) {
  if (!before) {
    return []
  }

  return fieldNames.filter(
    (field) => !isEqual(before.values[field], after.values[field]),
  )
}

function fillMissingScorecardValues<F extends Record<string, FieldDef>>(
  fieldNames: Array<keyof F & string>,
  values: InputValues,
  label: string,
): InputValues {
  const autoFilled: string[] = []
  const patched = { ...values }

  for (const field of fieldNames) {
    if (!Object.hasOwn(values, field)) {
      patched[field] = null
      autoFilled.push(field)
    }
  }

  if (autoFilled.length > 0 && shouldWarnInDev()) {
    console.warn(
      `[@umpire/async] scorecard() auto-filled missing keys in ${label}.values: ${autoFilled.map((field) => `"${field}"`).join(', ')}. Pass null explicitly to silence this warning.`,
    )
  }

  return patched
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

export function umpire<
  FInput extends Record<string, FieldInput>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(config: {
  fields: FInput
  rules: AnyRule<NormalizeFields<FInput>, C>[]
  validators?: import('./types.js').AnyValidationMap<NormalizeFields<FInput>>
  onAbort?: (reason?: unknown) => void
}): Umpire<NormalizeFields<FInput>, C> {
  type F = NormalizeFields<FInput>

  const { fields, rules: configRules } = normalizeConfig(
    config.fields,
    config.rules as Rule<F, C>[],
  )
  const fieldNames = Object.keys(fields) as Array<keyof F & string>
  const validators = normalizeAnyValidators(fields, config.validators)
  const hasValidators = Object.keys(validators).length > 0

  validateRules(fields, config.rules as Rule<F, C>[])

  const asyncRules = configRules.map((r) => toAsyncRule(r))

  const depGraph = buildGraph(fields, asyncRules as unknown as Rule<F, C>[])
  detectCycles(depGraph)
  const topoOrder = topologicalSort(depGraph, fieldNames)
  const rulesByTarget = coreIndexRulesByTarget(
    asyncRules as unknown as Rule<F, C>[],
  ) as unknown as Map<string, AsyncRule<F, C>[]>
  const { entries: ruleEntries, entryByRule } =
    buildAsyncRuleEntries(asyncRules)
  const rulesByTargetPhase = indexAsyncRulesByTargetPhase(rulesByTarget)
  const exportedGraph = exportGraph(depGraph)
  const { incomingByField, outgoingByField } = buildFieldEdgeLookup(
    exportedGraph,
    fieldNames,
  )

  let currentController: AbortController | null = null
  const onAbort = config.onAbort

  function runCheck(
    values: FieldValues<F>,
    conditions: C | undefined,
    prev: FieldValues<F> | undefined,
    externalSignal?: AbortSignal,
  ): Promise<AvailabilityMap<F>> {
    currentController?.abort()
    const controller = new AbortController()
    currentController = controller

    const signal = externalSignal
      ? composeAbortSignals(controller.signal, externalSignal)
      : controller.signal

    let abortHandler: (() => void) | undefined
    if (onAbort) {
      abortHandler = () => {
        try {
          onAbort(signal.reason)
        } catch {
          /* prevent unhandled */
        }
      }
      signal.addEventListener('abort', abortHandler, { once: true })
    }

    const resolvedConditions = createEmptyConditions(conditions)

    return evaluateAsync(
      fields,
      asyncRules,
      topoOrder,
      values,
      resolvedConditions,
      signal,
      prev,
      rulesByTarget,
      rulesByTargetPhase,
    )
      .then((availability) => {
        if (hasValidators) {
          return attachValidationMetadataAsync(
            values,
            availability,
            validators,
            fieldNames,
            signal,
          )
        }
        return availability
      })
      .finally(() => {
        if (abortHandler) {
          signal.removeEventListener('abort', abortHandler)
        }
        if (currentController === controller) {
          currentController = null
        }
      })
  }

  async function check(
    values: InputValues,
    conditions?: C,
    prev?: InputValues,
    signal?: AbortSignal,
  ): Promise<AvailabilityMap<F>> {
    return runCheck(
      values as FieldValues<F>,
      conditions,
      prev as FieldValues<F> | undefined,
      signal,
    )
  }

  async function play(
    before: Snapshot<C>,
    after: Snapshot<C>,
    signal?: AbortSignal,
  ): Promise<Foul<F>[]> {
    const beforeAvailability = await runCheck(
      before.values as FieldValues<F>,
      before.conditions,
      undefined,
      signal,
    )
    const afterAvailability = await runCheck(
      after.values as FieldValues<F>,
      after.conditions,
      before.values as FieldValues<F>,
      signal,
    )
    const recommendations: Foul<F>[] = []

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
        | FieldValues<F>[typeof field]
        | undefined

      if (!afterStatus.satisfied) {
        continue
      }

      if (isEqual(currentValue, suggestedValue)) {
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

  function init(overrides?: InputValues): FieldValues<F> {
    const values = {} as FieldValues<F>

    for (const field of fieldNames) {
      if (overrides && field in overrides) {
        values[field] = overrides[field] as FieldValues<F>[typeof field]
        continue
      }

      values[field] = fields[field].default as FieldValues<F>[typeof field]
    }

    return values
  }

  async function scorecard(
    snapshot: Snapshot<C>,
    options: AsyncScorecardOptions<C> = {},
  ): Promise<ScorecardResult<F, C>> {
    const { signal: externalSignal } = options
    const includeChallenge = options.includeChallenge ?? false

    const snapshotWithValues = {
      ...snapshot,
      values: fillMissingScorecardValues(
        fieldNames,
        snapshot.values,
        'snapshot',
      ),
    }
    const before = options.before
      ? {
          ...options.before,
          values: fillMissingScorecardValues(
            fieldNames,
            options.before.values,
            'before',
          ),
        }
      : undefined

    const typedValues = snapshotWithValues.values as FieldValues<F>
    const typedPrev = before?.values as FieldValues<F> | undefined

    const checkResult = await runCheck(
      typedValues,
      snapshotWithValues.conditions,
      typedPrev,
      externalSignal,
    )

    const changedFields = getChangedFields(
      fieldNames,
      before as { values: FieldValues<F> } | undefined,
      { values: typedValues },
    )

    const fouls = before
      ? await play(
          {
            values: before.values as FieldValues<F>,
            conditions: before.conditions,
          },
          {
            values: typedValues,
            conditions: snapshot.conditions,
          },
          externalSignal,
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
        const availability = checkResult[field]
        const value = typedValues[field]
        const present = !isEmptyPresent(value)
        const scorecardField: ScorecardResult<F, C>['fields'][typeof field] = {
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
        }

        if (includeChallenge) {
          const targetRules = rulesByTarget.get(field) ?? []
          scorecardField.trace = {
            field,
            enabled: availability.enabled,
            fair: availability.fair,
            directReasons: targetRules.map((rule) => {
              const entry = entryByRule.get(rule)
              return {
                rule: rule.type,
                ruleIndex: entry?.index,
                ruleId: entry?.id,
                passed: true,
                reason: null,
              } as ChallengeTrace['directReasons'][number]
            }),
            transitiveDeps: [],
            oneOfResolution: null,
          }
        }

        if (availability.valid !== undefined) {
          scorecardField.valid = availability.valid
        }

        if (availability.error !== undefined) {
          scorecardField.error = availability.error
        }

        return [field, scorecardField]
      }),
    ) as ScorecardResult<F, C>['fields']

    return {
      check: checkResult,
      graph: {
        nodes: [...exportedGraph.nodes],
        edges: exportedGraph.edges.map((edge) => ({ ...edge })),
      },
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

  async function challenge(
    field: keyof F & string,
    values: InputValues,
    conditions?: C,
    prev?: InputValues,
  ): Promise<ChallengeTrace> {
    if (!(field in fields)) {
      throw new Error(`[@umpire/async] Unknown field "${field}"`)
    }

    const controller = new AbortController()
    const signal = controller.signal

    const typedValues = values as FieldValues<F>
    const typedPrev = prev as FieldValues<F> | undefined
    const resolvedConditions = createEmptyConditions(conditions)

    const availability = await evaluateAsync(
      fields,
      asyncRules,
      topoOrder,
      typedValues,
      resolvedConditions,
      signal,
      typedPrev,
      rulesByTarget,
      rulesByTargetPhase,
    )

    const targetRules = rulesByTarget.get(field) ?? []

    const directReasons: ChallengeTrace['directReasons'] = targetRules.map(
      (rule) => {
        const entry = entryByRule.get(rule)
        return {
          rule: rule.type,
          ruleIndex: entry?.index,
          ruleId: entry?.id,
          passed: true,
          reason: null,
        }
      },
    )

    return {
      field,
      enabled: availability[field].enabled,
      fair: availability[field].fair,
      directReasons,
      transitiveDeps: [],
      oneOfResolution: null,
    }
  }

  return {
    check,
    play,
    scorecard,
    challenge,
    init,
    graph() {
      return {
        nodes: [...exportedGraph.nodes],
        edges: exportedGraph.edges.map((edge) => ({ ...edge })),
      }
    },
    rules() {
      return ruleEntries.map((entry) => ({
        ...entry,
        inspection: entry.inspection
          ? JSON.parse(JSON.stringify(entry.inspection))
          : undefined,
      }))
    },
  }
}
