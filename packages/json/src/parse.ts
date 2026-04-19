import {
  anyOf,
  disables,
  eitherOf,
  enabledWhen,
  fairWhen,
  getNamedCheckMetadata,
  oneOf,
  requires,
  type FieldDef,
  type FieldValues,
  type Rule,
  type ValidationMap,
} from '@umpire/core'

import {
  createNamedValidatorFromSpec,
  createNamedValidatorFromRule,
  defaultValidatorMessage,
} from './check-ops.js'
import { compileExpr } from './expr.js'
import { attachJsonDef } from './json-def.js'
import type {
  ExcludedRule,
  JsonCheckRule,
  JsonConditionDef,
  JsonRule,
  JsonValidatorDef,
  UmpireJsonSchema,
} from './schema.js'
import { hydrateIsEmptyStrategy } from './strategies.js'
import { validateSchema } from './validate.js'

export type ParsedFields = Record<string, FieldDef>
export type ParsedRules<C extends Record<string, unknown>> = Rule<ParsedFields, C>[]
export type ParsedValidators = ValidationMap<ParsedFields>
type ParsedSchemaMeta = {
  conditions?: Record<string, JsonConditionDef>
  excluded?: ExcludedRule[]
}

export type JsonSchemaParseResult =
  | { ok: true; schema: UmpireJsonSchema }
  | { ok: false; errors: string[] }

export type FromJsonSafeResult<C extends Record<string, unknown> = Record<string, unknown>> =
  | {
      ok: true
      schema: UmpireJsonSchema
      fields: ParsedFields
      rules: ParsedRules<C>
      validators: ParsedValidators
    }
  | { ok: false; errors: string[] }

export function parseJsonSchema(raw: unknown): JsonSchemaParseResult {
  try {
    validateSchema(raw)
    return { ok: true, schema: raw }
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}

type NamedFairPredicate<C extends Record<string, unknown>> = ((
  value: unknown,
  values: FieldValues<ParsedFields>,
  conditions: C,
) => boolean) & {
  _checkField?: string
  _namedCheck?: ReturnType<typeof getNamedCheckMetadata>
}

function compileFairExpr<C extends Record<string, unknown>>(
  rule: Extract<JsonRule, { type: 'fairWhen' }>,
  schema: UmpireJsonSchema,
): NamedFairPredicate<C> {
  const predicate = compileExpr<ParsedFields, C>(rule.when, {
    fieldNames: new Set(Object.keys(schema.fields)),
    conditions: schema.conditions,
  })

  const fairPredicate = ((_: unknown, values: FieldValues<ParsedFields>, conditions: C) =>
    predicate(values, conditions)) as NamedFairPredicate<C>

  fairPredicate._checkField = predicate._checkField
  fairPredicate._namedCheck = predicate._namedCheck

  return fairPredicate
}

function parseFieldDefs(fields: UmpireJsonSchema['fields']): ParsedFields {
  const parsed: ParsedFields = Object.create(null) as ParsedFields

  for (const [field, definition] of Object.entries(fields)) {
    parsed[field] = {
      required: definition.required,
      default: definition.default,
      isEmpty: hydrateIsEmptyStrategy(definition.isEmpty),
    }
  }

  return parsed
}

function parseCheckRule<C extends Record<string, unknown>>(rule: JsonCheckRule): Rule<ParsedFields, C> {
  const validator = createNamedValidatorFromRule(rule)
  const metadata = getNamedCheckMetadata(validator)
  const predicate = ((value: unknown) => validator.validate(value as never)) as NamedFairPredicate<C>

  predicate._checkField = rule.field
  predicate._namedCheck = metadata

  const parsedRule = fairWhen<ParsedFields, C>(rule.field, predicate, {
    reason: rule.reason ?? defaultValidatorMessage(rule),
  })

  return attachJsonDef(parsedRule, rule)
}

function parseValidatorDef(definition: JsonValidatorDef) {
  const validator = createNamedValidatorFromSpec(definition)

  return attachJsonDef(
    definition.error === undefined
      ? { validator }
      : { validator, error: definition.error },
    definition,
  )
}

function parseValidators(validators: UmpireJsonSchema['validators']): ParsedValidators {
  const parsed = Object.create(null) as ParsedValidators

  for (const [field, definition] of Object.entries(validators ?? {})) {
    parsed[field] = parseValidatorDef(definition)
  }

  return parsed
}

function parseRule<C extends Record<string, unknown>>(
  rule: JsonRule,
  schema: UmpireJsonSchema,
): Rule<ParsedFields, C> {
  const fieldNames = new Set(Object.keys(schema.fields))
  const exprOptions = {
    fieldNames,
    conditions: schema.conditions,
  }

  switch (rule.type) {
    case 'requires':
      if ('dependency' in rule) {
        return attachJsonDef(requires<ParsedFields, C>(rule.field, rule.dependency, {
          reason: rule.reason,
        }), rule)
      }

      if ('dependencies' in rule) {
        const dependencies = rule.dependencies.map((dependency) =>
          typeof dependency === 'string'
            ? dependency
            : compileExpr<ParsedFields, C>(dependency, exprOptions))

        return attachJsonDef(
          rule.reason
            ? requires<ParsedFields, C>(rule.field, ...dependencies, { reason: rule.reason })
            : requires<ParsedFields, C>(rule.field, ...dependencies),
          rule,
        )
      }

      return attachJsonDef(requires<ParsedFields, C>(rule.field, compileExpr(rule.when, exprOptions), {
        reason: rule.reason,
      }), rule)
    case 'enabledWhen':
      return attachJsonDef(enabledWhen<ParsedFields, C>(rule.field, compileExpr(rule.when, exprOptions), {
        reason: rule.reason,
      }), rule)
    case 'disables':
      if ('source' in rule) {
        return attachJsonDef(disables<ParsedFields, C>(rule.source, rule.targets, {
          reason: rule.reason,
        }), rule)
      }

      return attachJsonDef(disables<ParsedFields, C>(compileExpr(rule.when, exprOptions), rule.targets, {
        reason: rule.reason,
      }), rule)
    case 'oneOf':
      return attachJsonDef(oneOf<ParsedFields, C>(rule.group, rule.branches), rule)
    case 'fairWhen':
      return attachJsonDef(fairWhen<ParsedFields, C>(rule.field, compileFairExpr<C>(rule, schema), {
        reason: rule.reason,
      }), rule)
    case 'eitherOf': {
      const parsedBranches = Object.create(null) as Record<string, Array<Rule<ParsedFields, C>>>

      for (const [branchName, branchRules] of Object.entries(rule.branches)) {
        parsedBranches[branchName] = branchRules.map((innerRule) => parseRule<C>(innerRule, schema))
      }

      return attachJsonDef(eitherOf<ParsedFields, C>(rule.group, parsedBranches), rule)
    }
    case 'anyOf': {
      const innerRules = rule.rules.map((innerRule) => parseRule<C>(innerRule, schema))
      return attachJsonDef(anyOf<ParsedFields, C>(...innerRules), rule)
    }
    case 'check':
      return parseCheckRule<C>(rule)
    default:
      throw new Error(`[@umpire/json] Unknown rule type "${String((rule as { type?: unknown }).type)}"`)
  }
}

export function fromJson<C extends Record<string, unknown> = Record<string, unknown>>(
  schema: UmpireJsonSchema,
): {
  fields: ParsedFields
  rules: ParsedRules<C>
  validators: ParsedValidators
} {
  validateSchema(schema)

  return hydrateValidatedSchema<C>(schema)
}

function hydrateValidatedSchema<C extends Record<string, unknown> = Record<string, unknown>>(
  schema: UmpireJsonSchema,
): {
  fields: ParsedFields
  rules: ParsedRules<C>
  validators: ParsedValidators
} {
  const meta: ParsedSchemaMeta = {
    conditions: schema.conditions,
    excluded: schema.excluded,
  }

  const fields = attachJsonDef(parseFieldDefs(schema.fields), meta)
  const rules = attachJsonDef(schema.rules.map((rule) => parseRule<C>(rule, schema)), meta)
  const validators = parseValidators(schema.validators)

  return {
    fields,
    rules,
    validators,
  }
}

export function fromJsonSafe<C extends Record<string, unknown> = Record<string, unknown>>(
  raw: unknown,
): FromJsonSafeResult<C> {
  const parsedSchema = parseJsonSchema(raw)

  if (!parsedSchema.ok) {
    return parsedSchema
  }

  const { fields, rules, validators } = hydrateValidatedSchema<C>(parsedSchema.schema)

  return {
    ok: true,
    schema: parsedSchema.schema,
    fields,
    rules,
    validators,
  }
}
