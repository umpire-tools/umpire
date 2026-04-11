import {
  getNamedCheckMetadata,
  inspectRule,
  type FieldDef,
  type JsonPrimitive,
  type Rule,
  type RuleInspection,
  type ValidationMap,
} from '@umpire/core'

import {
  createCheckRuleFromMetadata,
  createValidatorSpecFromMetadata,
  createValidatorDefFromMetadata,
} from './check-ops.js'
import { getJsonDef } from './json-def.js'
import type {
  ExcludedRule,
  JsonConditionDef,
  JsonFieldDef,
  JsonExpr,
  JsonRule,
  JsonValidatorDef,
  UmpireJsonSchema,
} from './schema.js'
import { getJsonIsEmptyStrategy } from './strategies.js'
import { validateSchema } from './validate.js'

type SerializeMeta = {
  conditions?: Record<string, JsonConditionDef>
  excluded?: ExcludedRule[]
}

export type ToJsonConfig<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> = {
  fields: F
  rules: Rule<F, C>[]
  validators?: ValidationMap<F>
  conditions?: Record<string, JsonConditionDef>
}

type SerializeRuleResult = {
  rules: JsonRule[]
  excluded: ExcludedRule[]
  coverageKeys: string[]
}

type SerializeValidatorResult = {
  validator?: JsonValidatorDef
  excluded: ExcludedRule[]
  coverageKeys: string[]
}

function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneJson(entry)) as T
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)]),
    ) as T
  }

  return value
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function createExcluded(
  type: string,
  description: string,
  field?: string,
  key?: string,
  signature?: string,
): ExcludedRule {
  return field
    ? { type, field, description, ...(key ? { key } : {}), ...(signature ? { signature } : {}) }
    : { type, description, ...(key ? { key } : {}), ...(signature ? { signature } : {}) }
}

function createKey(...parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join(':')
}

function createFieldSlotKey(field: string, slot: 'default' | 'isEmpty' | 'validator'): string {
  return createKey('field', field, slot)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidationEntryObject(value: unknown): value is { validator: unknown; error?: unknown } {
  return isRecord(value) && 'validator' in value
}

function createTargetsKeyPart(targets: string[]): string {
  return JSON.stringify([...targets].sort())
}

function createCheckParamsKeyPart(rule: Extract<JsonRule, { type: 'check' }>): string {
  switch (rule.op) {
    case 'matches':
      return JSON.stringify({ pattern: rule.pattern })
    case 'minLength':
    case 'maxLength':
    case 'min':
    case 'max':
      return JSON.stringify({ value: rule.value })
    case 'range':
      return JSON.stringify({ min: rule.min, max: rule.max })
    default:
      return ''
  }
}

function createCheckExprFromMetadata(
  field: string,
  metadata: Parameters<typeof createValidatorSpecFromMetadata>[0],
): Extract<JsonExpr, { op: 'check' }> | undefined {
  const spec = createValidatorSpecFromMetadata(metadata)

  return spec
    ? {
        op: 'check',
        field,
        check: spec,
      }
    : undefined
}

function createRuleKey(rule: JsonRule): string | undefined {
  switch (rule.type) {
    case 'requires':
      return 'dependency' in rule
        ? createKey('rule', 'requires', rule.field, 'dependency', rule.dependency)
        : 'dependencies' in rule
          ? createKey('rule', 'requires', rule.field, 'dependencies', JSON.stringify(rule.dependencies))
        : undefined
    case 'enabledWhen':
      return createKey('rule', 'enabledWhen', rule.field)
    case 'disables':
      return 'source' in rule
        ? createKey('rule', 'disables', 'source', rule.source, 'targets', createTargetsKeyPart(rule.targets))
        : undefined
    case 'oneOf':
      return createKey('rule', 'oneOf', rule.group)
    case 'fairWhen':
      return createKey('rule', 'fairWhen', rule.field)
    case 'anyOf': {
      const innerKeys = rule.rules.map((innerRule) => createRuleKey(innerRule))
      return innerKeys.every((key): key is string => key !== undefined)
        ? createKey('rule', 'anyOf', JSON.stringify(innerKeys))
        : undefined
    }
    case 'check': {
      const params = createCheckParamsKeyPart(rule)
      return params.length > 0
        ? createKey('rule', 'check', rule.field, rule.op, params)
        : createKey('rule', 'check', rule.field, rule.op)
    }
    default:
      return undefined
  }
}

function createCoverageKeys(rule: JsonRule): string[] {
  const key = createRuleKey(rule)
  const keys = key ? [key] : []

  if (rule.type === 'check') {
    keys.push(createKey('rule', 'fairWhen', rule.field))
  }

  return keys
}

function mergeExcluded(
  carried: ExcludedRule[],
  generated: ExcludedRule[],
  coverageKeys: Set<string>,
): ExcludedRule[] {
  const merged: ExcludedRule[] = []
  const carriedIndexesByKey = new Map<string, number>()

  for (const entry of carried) {
    if (entry.key && coverageKeys.has(entry.key)) {
      continue
    }

    if (entry.key) {
      const existingIndex = carriedIndexesByKey.get(entry.key)

      if (existingIndex !== undefined) {
        merged[existingIndex] = entry
        continue
      }
    }

    merged.push(entry)

    if (entry.key) {
      carriedIndexesByKey.set(entry.key, merged.length - 1)
    }
  }

  for (const entry of generated) {
    if (entry.key) {
      const carriedIndex = carriedIndexesByKey.get(entry.key)

      if (carriedIndex !== undefined) {
        merged[carriedIndex] = entry
        carriedIndexesByKey.delete(entry.key)
        continue
      }
    }

    merged.push(entry)
  }

  return merged
}


function serializeField(name: string, definition: FieldDef): {
  field: JsonFieldDef
  excluded: ExcludedRule[]
  coverageKeys: string[]
} {
  const excluded: ExcludedRule[] = []
  const field: JsonFieldDef = {}
  const coverageKeys: string[] = []

  if (definition.required === true) {
    field.required = true
  }

  if (definition.default !== undefined) {
    if (isJsonPrimitive(definition.default)) {
      field.default = definition.default
      coverageKeys.push(createFieldSlotKey(name, 'default'))
    } else {
      excluded.push(createExcluded(
        'field:default',
        'Field default is not a JSON primitive and cannot be serialized',
        name,
        createFieldSlotKey(name, 'default'),
      ))
    }
  }

  const isEmptyStrategy = getJsonIsEmptyStrategy(definition.isEmpty)
  if (isEmptyStrategy) {
    field.isEmpty = isEmptyStrategy
    coverageKeys.push(createFieldSlotKey(name, 'isEmpty'))
  } else if (definition.isEmpty !== undefined) {
    excluded.push(createExcluded(
      'field:isEmpty',
      'Field isEmpty uses a custom function and cannot be serialized',
      name,
      createFieldSlotKey(name, 'isEmpty'),
      '(value) => boolean',
    ))
  }

  return { field, excluded, coverageKeys }
}

function serializeValidator(field: string, entry: unknown): SerializeValidatorResult {
  const coverageKey = createFieldSlotKey(field, 'validator')
  const carried = getJsonDef<JsonValidatorDef>(entry)

  if (carried) {
    return {
      validator: cloneJson(carried),
      excluded: [],
      coverageKeys: [coverageKey],
    }
  }

  const validator = isValidationEntryObject(entry) ? entry.validator : entry
  const error = isValidationEntryObject(entry) && typeof entry.error === 'string' ? entry.error : undefined
  const metadata = getNamedCheckMetadata(validator)

  if (!metadata) {
    return {
      excluded: [createExcluded(
        'field:validator',
        'Field validator cannot be serialized unless it uses portable validator metadata from @umpire/json',
        field,
        coverageKey,
      )],
      coverageKeys: [],
    }
  }

  const serialized = createValidatorDefFromMetadata(metadata, error)

  if (!serialized) {
    return {
      excluded: [createExcluded(
        'field:validator',
        'Field validator uses metadata that is not part of the JSON validator spec',
        field,
        coverageKey,
      )],
      coverageKeys: [],
    }
  }

  return {
    validator: serialized,
    excluded: [],
    coverageKeys: [coverageKey],
  }
}

function excludeInspection(
  inspection: RuleInspection<Record<string, FieldDef>, Record<string, unknown>>,
  description: string,
  signature?: string,
  key?: string,
): SerializeRuleResult {
  const field =
    'target' in inspection ? inspection.target
    : 'targets' in inspection ? inspection.targets[0]
    : undefined

  return {
    rules: [],
    excluded: [createExcluded(inspection.kind, description, field, key, signature)],
    coverageKeys: [],
  }
}

function serializeInspection(
  inspection: RuleInspection<Record<string, FieldDef>, Record<string, unknown>>,
  nestedInAnyOf: boolean,
): SerializeRuleResult {
  switch (inspection.kind) {
    case 'enabledWhen':
      if (inspection.hasDynamicReason) {
        return excludeInspection(
          inspection,
          'enabledWhen() uses a dynamic reason function and cannot be serialized',
          '(values, conditions) => string',
          createKey('rule', 'enabledWhen', inspection.target),
        )
      }

      if (inspection.predicate?.field && inspection.predicate.namedCheck) {
        const when = createCheckExprFromMetadata(inspection.predicate.field, inspection.predicate.namedCheck)

        if (when) {
          const rule: Extract<JsonRule, { type: 'enabledWhen' }> = {
            type: 'enabledWhen',
            field: inspection.target,
            when,
            ...(inspection.reason ? { reason: inspection.reason } : {}),
          }

          return {
            rules: [rule],
            excluded: [],
            coverageKeys: [createKey('rule', 'enabledWhen', inspection.target)],
          }
        }
      }

      return excludeInspection(
        inspection,
        'enabledWhen() predicates are only serializable when hydrated from JSON or when they map to a portable validator',
        undefined,
        createKey('rule', 'enabledWhen', inspection.target),
      )
    case 'disables':
      if (inspection.hasDynamicReason) {
        return excludeInspection(
          inspection,
          'disables() uses a dynamic reason function and cannot be serialized',
          '(values, conditions) => string',
          inspection.source.kind === 'field'
            ? createKey(
                'rule',
                'disables',
                'source',
                inspection.source.field,
                'targets',
                createTargetsKeyPart(inspection.targets),
              )
            : undefined,
        )
      }

      if (inspection.source.kind !== 'field') {
        if (inspection.source.predicate?.field && inspection.source.predicate.namedCheck) {
          const when = createCheckExprFromMetadata(
            inspection.source.predicate.field,
            inspection.source.predicate.namedCheck,
          )

          if (when) {
            const rule: Extract<JsonRule, { type: 'disables'; when: JsonExpr }> = {
              type: 'disables',
              when,
              targets: [...inspection.targets],
              ...(inspection.reason ? { reason: inspection.reason } : {}),
            }

            return {
              rules: [rule],
              excluded: [],
              coverageKeys: [],
            }
          }
        }

        return excludeInspection(
          inspection,
          'disables() with predicate sources cannot be serialized unless hydrated from JSON or when they map to a portable validator',
        )
      }

      return {
        rules: [{
          type: 'disables',
          source: inspection.source.field,
          targets: [...inspection.targets],
          ...(inspection.reason ? { reason: inspection.reason } : {}),
        }],
        excluded: [],
        coverageKeys: [createKey(
          'rule',
          'disables',
          'source',
          inspection.source.field,
          'targets',
          createTargetsKeyPart(inspection.targets),
        )],
      }
    case 'fairWhen': {
      if (inspection.hasDynamicReason) {
        return excludeInspection(
          inspection,
          'fairWhen() uses a dynamic reason function and cannot be serialized',
          '(values, conditions) => string',
          createKey('rule', 'fairWhen', inspection.target),
        )
      }

      const namedCheckRule =
        inspection.predicate?.field === inspection.target && inspection.predicate.namedCheck
          ? createCheckRuleFromMetadata(
              inspection.target,
              inspection.predicate.namedCheck,
              inspection.reason,
            )
          : undefined

      if (namedCheckRule) {
        return {
          rules: [namedCheckRule],
          excluded: [],
          coverageKeys: createCoverageKeys(namedCheckRule),
        }
      }

      if (inspection.predicate?.field && inspection.predicate.namedCheck) {
        const when = createCheckExprFromMetadata(inspection.predicate.field, inspection.predicate.namedCheck)

        if (when) {
          const rule: Extract<JsonRule, { type: 'fairWhen' }> = {
            type: 'fairWhen',
            field: inspection.target,
            when,
            ...(inspection.reason ? { reason: inspection.reason } : {}),
          }

          return {
            rules: [rule],
            excluded: [],
            coverageKeys: [createKey('rule', 'fairWhen', inspection.target)],
          }
        }
      }

      return excludeInspection(
        inspection,
        'fairWhen() predicates are only serializable when hydrated from JSON or when they map to a portable validator on the same field',
        '(value, values, conditions) => boolean',
        createKey('rule', 'fairWhen', inspection.target),
      )
    }
    case 'requires': {
      if (inspection.hasDynamicReason) {
        return excludeInspection(
          inspection,
          'requires() uses a dynamic reason function and cannot be serialized',
          '(values, conditions) => string',
          undefined,
        )
      }

      const fieldDependencies = inspection.dependencies.filter(
        (
          dependency,
        ): dependency is Extract<(typeof inspection.dependencies)[number], { kind: 'field' }> =>
          dependency.kind === 'field',
      )

      const serializedDependencies = inspection.dependencies.map((dependency) => {
        if (dependency.kind === 'field') {
          return dependency.field
        }

        if (dependency.predicate?.field && dependency.predicate.namedCheck) {
          return createCheckExprFromMetadata(
            dependency.predicate.field,
            dependency.predicate.namedCheck,
          )
        }

        return undefined
      })

      if (serializedDependencies.some((dependency) => dependency === undefined)) {
        return excludeInspection(
          inspection,
          'requires() with predicate dependencies cannot be serialized unless hydrated from JSON or when those predicates map to portable validators',
          undefined,
        )
      }

      if (
        fieldDependencies.length === inspection.dependencies.length &&
        !nestedInAnyOf &&
        serializedDependencies.length > 1
      ) {
        const rules = fieldDependencies.map((dependency) => ({
          type: 'requires' as const,
          field: inspection.target,
          dependency: dependency.field,
          ...(inspection.reason ? { reason: inspection.reason } : {}),
        }))

        return {
          rules,
          excluded: [],
          coverageKeys: rules.map((rule) => createCoverageKeys(rule)).flat(),
        }
      }

      const [firstDependency] = serializedDependencies as Array<string | JsonExpr>

      const rules = serializedDependencies.length === 1
        ? [typeof firstDependency === 'string'
            ? {
                type: 'requires' as const,
                field: inspection.target,
                dependency: firstDependency,
                ...(inspection.reason ? { reason: inspection.reason } : {}),
              }
            : {
                type: 'requires' as const,
                field: inspection.target,
                when: firstDependency,
                ...(inspection.reason ? { reason: inspection.reason } : {}),
              }]
        : [{
            type: 'requires' as const,
            field: inspection.target,
            dependencies: serializedDependencies as Array<string | JsonExpr>,
            ...(inspection.reason ? { reason: inspection.reason } : {}),
          }]

      return {
        rules,
        excluded: [],
        coverageKeys: rules.map((rule) => createCoverageKeys(rule)).flat(),
      }
    }
    case 'oneOf':
      if (inspection.hasDynamicActiveBranch || inspection.activeBranch !== undefined) {
        return excludeInspection(
          inspection,
          'oneOf() activeBranch overrides are not part of the JSON spec',
          '(values, conditions) => string | null | undefined',
          createKey('rule', 'oneOf', inspection.groupName),
        )
      }

      if (inspection.hasDynamicReason || inspection.reason !== undefined) {
        return excludeInspection(
          inspection,
          'oneOf() reason overrides are not part of the JSON spec',
          '(values, conditions) => string',
          createKey('rule', 'oneOf', inspection.groupName),
        )
      }

      return {
        rules: [{
          type: 'oneOf',
          group: inspection.groupName,
          branches: cloneJson(inspection.branches),
        }],
        excluded: [],
        coverageKeys: [createKey('rule', 'oneOf', inspection.groupName)],
      }
    case 'anyOf': {
      const innerRules: JsonRule[] = []

      for (const innerInspection of inspection.rules) {
        const inner = serializeInspection(
          innerInspection as RuleInspection<Record<string, FieldDef>, Record<string, unknown>>,
          true,
        )

        if (inner.excluded.length > 0 || inner.rules.length !== 1) {
          return {
            rules: [],
            excluded: [
              createExcluded(
                'anyOf',
                'anyOf() contains inner rules that cannot be serialized one-to-one into JSON',
                undefined,
                undefined,
              ),
            ],
            coverageKeys: [],
          }
        }

        innerRules.push(inner.rules[0])
      }

      return {
        rules: [{
          type: 'anyOf',
          rules: innerRules,
        }],
        excluded: [],
        coverageKeys: createRuleKey({ type: 'anyOf', rules: innerRules })
          ? [createRuleKey({ type: 'anyOf', rules: innerRules }) as string]
          : [],
      }
    }
    case 'custom':
      return {
        rules: [],
        excluded: [
          createExcluded(
            inspection.type,
            `Custom rule "${inspection.type}" is not part of the JSON spec`,
            inspection.targets[0],
            undefined,
          ),
        ],
        coverageKeys: [],
      }
  }
}

function serializeRule<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  rule: Rule<F, C>,
): SerializeRuleResult {
  const jsonDef = getJsonDef<JsonRule>(rule)
  if (jsonDef) {
    return {
      rules: [cloneJson(jsonDef)],
      excluded: [],
      coverageKeys: createCoverageKeys(jsonDef),
    }
  }

  const inspection = inspectRule(rule)
  if (!inspection) {
    return {
      rules: [],
      excluded: [
        createExcluded(
          rule.type,
          `Rule "${rule.type}" could not be inspected for JSON serialization`,
          rule.targets[0],
          undefined,
        ),
      ],
      coverageKeys: [],
    }
  }

  return serializeInspection(
    inspection as RuleInspection<Record<string, FieldDef>, Record<string, unknown>>,
    false,
  )
}

export function toJson<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  config: ToJsonConfig<F, C>,
): UmpireJsonSchema {
  const meta = getJsonDef<SerializeMeta>(config.fields) ?? getJsonDef<SerializeMeta>(config.rules)
  const fields = {} as Record<string, JsonFieldDef>
  const rules: JsonRule[] = []
  const validators = {} as Record<string, JsonValidatorDef>
  const generatedExcluded: ExcludedRule[] = []
  const coverageKeys = new Set<string>()

  for (const [fieldName, definition] of Object.entries(config.fields)) {
    const serializedField = serializeField(fieldName, definition)
    fields[fieldName] = serializedField.field
    generatedExcluded.push(...serializedField.excluded)
    for (const key of serializedField.coverageKeys) {
      coverageKeys.add(key)
    }
  }

  for (const rule of config.rules) {
    const serializedRule = serializeRule(rule)
    rules.push(...serializedRule.rules)
    generatedExcluded.push(...serializedRule.excluded)
    for (const key of serializedRule.coverageKeys) {
      coverageKeys.add(key)
    }
  }

  for (const [fieldName, entry] of Object.entries(config.validators ?? {})) {
    if (entry === undefined) {
      continue
    }

    const serializedValidator = serializeValidator(fieldName, entry)

    if (serializedValidator.validator) {
      validators[fieldName] = serializedValidator.validator
    }

    generatedExcluded.push(...serializedValidator.excluded)
    for (const key of serializedValidator.coverageKeys) {
      coverageKeys.add(key)
    }
  }

  const conditions = config.conditions ?? meta?.conditions
  const excluded = mergeExcluded(
    meta?.excluded ? cloneJson(meta.excluded) : [],
    generatedExcluded,
    coverageKeys,
  )
  const schema: UmpireJsonSchema = {
    version: 1,
    fields,
    rules,
    ...(Object.keys(validators).length > 0 ? { validators } : {}),
    ...(conditions ? { conditions: cloneJson(conditions) } : {}),
    ...(excluded.length > 0 ? { excluded } : {}),
  }

  validateSchema(schema)

  return schema
}
