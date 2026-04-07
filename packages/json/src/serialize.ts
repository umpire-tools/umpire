import {
  inspectRule,
  type FieldDef,
  type JsonPrimitive,
  type Rule,
  type RuleInspection,
} from '@umpire/core'

import { createCheckRuleFromMetadata } from './check-ops.js'
import { getJsonDef } from './json-def.js'
import type {
  ExcludedRule,
  JsonConditionDef,
  JsonFieldDef,
  JsonRule,
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
  conditions?: Record<string, JsonConditionDef>
}

type SerializeRuleResult = {
  rules: JsonRule[]
  excluded: ExcludedRule[]
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
  signature?: string,
): ExcludedRule {
  return field
    ? { type, field, description, ...(signature ? { signature } : {}) }
    : { type, description, ...(signature ? { signature } : {}) }
}

function getSerializeMeta(value: unknown): SerializeMeta | undefined {
  return getJsonDef<SerializeMeta>(value)
}

function serializeField(name: string, definition: FieldDef): {
  field: JsonFieldDef
  excluded: ExcludedRule[]
} {
  const excluded: ExcludedRule[] = []
  const field: JsonFieldDef = {}

  if (definition.required === true) {
    field.required = true
  }

  if (definition.default !== undefined) {
    if (isJsonPrimitive(definition.default)) {
      field.default = definition.default
    } else {
      excluded.push(createExcluded(
        'field:default',
        'Field default is not a JSON primitive and cannot be serialized',
        name,
      ))
    }
  }

  const isEmptyStrategy = getJsonIsEmptyStrategy(definition.isEmpty)
  if (isEmptyStrategy) {
    field.isEmpty = isEmptyStrategy
  } else if (definition.isEmpty !== undefined) {
    excluded.push(createExcluded(
      'field:isEmpty',
      'Field isEmpty uses a custom function and cannot be serialized',
      name,
      '(value) => boolean',
    ))
  }

  return { field, excluded }
}

function excludeInspection(
  inspection: RuleInspection<Record<string, FieldDef>, Record<string, unknown>>,
  description: string,
  signature?: string,
): SerializeRuleResult {
  const field =
    'target' in inspection ? inspection.target
    : 'targets' in inspection ? inspection.targets[0]
    : undefined

  return {
    rules: [],
    excluded: [createExcluded(inspection.kind, description, field, signature)],
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
        )
      }

      return excludeInspection(
        inspection,
        'enabledWhen() predicates are only serializable when hydrated from JSON',
      )
    case 'disables':
      if (inspection.hasDynamicReason) {
        return excludeInspection(
          inspection,
          'disables() uses a dynamic reason function and cannot be serialized',
          '(values, conditions) => string',
        )
      }

      if (inspection.source.kind !== 'field') {
        return excludeInspection(
          inspection,
          'disables() with predicate sources cannot be serialized unless hydrated from JSON',
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
      }
    case 'fairWhen': {
      if (inspection.hasDynamicReason) {
        return excludeInspection(
          inspection,
          'fairWhen() uses a dynamic reason function and cannot be serialized',
          '(values, conditions) => string',
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
        }
      }

      return excludeInspection(
        inspection,
        'fairWhen() predicates are only serializable when hydrated from JSON or when they map to a named check on the same field',
        '(value, values, conditions) => boolean',
      )
    }
    case 'requires': {
      if (inspection.hasDynamicReason) {
        return excludeInspection(
          inspection,
          'requires() uses a dynamic reason function and cannot be serialized',
          '(values, conditions) => string',
        )
      }

      const fieldDependencies = inspection.dependencies.filter(
        (
          dependency,
        ): dependency is Extract<(typeof inspection.dependencies)[number], { kind: 'field' }> =>
          dependency.kind === 'field',
      )

      if (fieldDependencies.length !== inspection.dependencies.length) {
        return excludeInspection(
          inspection,
          'requires() with predicate dependencies cannot be serialized unless hydrated from JSON',
        )
      }

      const rules = fieldDependencies.map((dependency) => ({
        type: 'requires' as const,
        field: inspection.target,
        dependency: dependency.field,
        ...(inspection.reason ? { reason: inspection.reason } : {}),
      }))

      if (nestedInAnyOf && rules.length !== 1) {
        return excludeInspection(
          inspection,
          'requires() with multiple dependencies cannot be nested inside anyOf() in JSON output',
        )
      }

      return {
        rules,
        excluded: [],
      }
    }
    case 'oneOf':
      if (inspection.hasDynamicActiveBranch || inspection.activeBranch !== undefined) {
        return excludeInspection(
          inspection,
          'oneOf() activeBranch overrides are not part of the JSON spec',
          '(values, conditions) => string | null | undefined',
        )
      }

      if (inspection.hasDynamicReason || inspection.reason !== undefined) {
        return excludeInspection(
          inspection,
          'oneOf() reason overrides are not part of the JSON spec',
          '(values, conditions) => string',
        )
      }

      return {
        rules: [{
          type: 'oneOf',
          group: inspection.groupName,
          branches: cloneJson(inspection.branches),
        }],
        excluded: [],
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
              ),
            ],
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
          ),
        ],
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
        ),
      ],
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
  const meta = getSerializeMeta(config.fields) ?? getSerializeMeta(config.rules)
  const fields = {} as Record<string, JsonFieldDef>
  const rules: JsonRule[] = []
  const excluded = meta?.excluded ? cloneJson(meta.excluded) : []

  for (const [fieldName, definition] of Object.entries(config.fields)) {
    const serializedField = serializeField(fieldName, definition)
    fields[fieldName] = serializedField.field
    excluded.push(...serializedField.excluded)
  }

  for (const rule of config.rules) {
    const serializedRule = serializeRule(rule)
    rules.push(...serializedRule.rules)
    excluded.push(...serializedRule.excluded)
  }

  const conditions = config.conditions ?? meta?.conditions
  const schema: UmpireJsonSchema = {
    version: 1,
    fields,
    rules,
    ...(conditions ? { conditions: cloneJson(conditions) } : {}),
    ...(excluded.length > 0 ? { excluded } : {}),
  }

  validateSchema(schema)

  return schema
}
