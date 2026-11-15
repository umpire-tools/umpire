import { isPlainRecord } from '@umpire/core/guards'
import type {
  ExcludedRule,
  UmpireJsonSchema,
  JsonRule,
  JsonFieldDef,
  JsonValidatorDef,
} from './schema.js'
import { assertValidCheckRule, assertValidValidatorSpec } from './check-ops.js'
import { compileExpr } from './expr.js'
import { isJsonPrimitive } from './json-values.js'
import { isJsonIsEmptyStrategy } from './strategies.js'

type JsonRuleConstraint = 'enabled' | 'fair'

const conditionTypes = new Set([
  'boolean',
  'string',
  'number',
  'string[]',
  'number[]',
])

function assertKnownMembers(
  value: object,
  allowed: readonly string[],
  context: string,
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(`[@umpire/json] ${context} has unknown member "${key}"`)
    }
  }
}

function validatorSpecMembers(op: unknown): string[] {
  switch (op) {
    case 'email':
    case 'url':
    case 'integer':
      return ['op']
    case 'matches':
      return ['op', 'pattern']
    case 'minLength':
    case 'maxLength':
    case 'min':
    case 'max':
      return ['op', 'value']
    case 'range':
      return ['op', 'min', 'max']
    default:
      return ['op']
  }
}

function assertString(
  value: unknown,
  context: string,
): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`[@umpire/json] ${context} must be a string`)
  }
}

function assertNumber(
  value: unknown,
  context: string,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[@umpire/json] ${context} must be a finite number`)
  }
}

function assertPrimitive(value: unknown, context: string) {
  if (!isJsonPrimitive(value)) {
    throw new Error(`[@umpire/json] ${context} must be a JSON primitive`)
  }
}

function assertPrimitiveArray(value: unknown, context: string) {
  if (!Array.isArray(value) || !value.every(isJsonPrimitive)) {
    throw new Error(
      `[@umpire/json] ${context} must be an array of JSON primitives`,
    )
  }
}

function assertStringArray(value: unknown, context: string) {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string')
  ) {
    throw new Error(`[@umpire/json] ${context} must be an array of strings`)
  }
}

function validateValidatorSpecMembers(
  spec: unknown,
  additionalMembers: readonly string[] = [],
) {
  if (!isPlainRecord(spec)) {
    throw new Error('[@umpire/json] Validator spec must be an object')
  }

  assertKnownMembers(
    spec,
    [...validatorSpecMembers(spec.op), ...additionalMembers],
    'Validator spec',
  )

  switch (spec.op) {
    case 'email':
    case 'url':
    case 'integer':
      break
    case 'matches':
      assertString(spec.pattern, 'Validator "matches" pattern')
      break
    case 'minLength':
    case 'maxLength':
    case 'min':
    case 'max':
      assertNumber(spec.value, `Validator "${spec.op}" value`)
      break
    case 'range':
      assertNumber(spec.min, 'Validator "range" min')
      assertNumber(spec.max, 'Validator "range" max')
      break
  }

  assertValidValidatorSpec(spec as JsonValidatorDef)
}

const scalarMembershipOps = new Set(['in', 'notIn', 'fieldInCond'])

const nonArrayStrategies = new Set(['string', 'number', 'boolean', 'object'])

function isNonArrayStrategy(strategy: JsonFieldDef['isEmpty']): boolean {
  return strategy !== undefined && nonArrayStrategies.has(strategy)
}

// Membership ops have opposite array requirements: `in`-family fields hold one
// scalar, `contains` fields hold the list. The definitions live only in the
// schema, so the cross-check runs here rather than in the compiler.
function assertMembershipTarget(
  op: string,
  field: string,
  fieldDefs: Record<string, JsonFieldDef>,
) {
  const strategy = fieldDefs[field]?.isEmpty

  if (scalarMembershipOps.has(op) && strategy === 'array') {
    throw new Error(
      `[@umpire/json] Expression "${op}" requires a scalar field, but "${field}" is declared "isEmpty": "array"`,
    )
  }

  if (op === 'contains' && isNonArrayStrategy(strategy)) {
    throw new Error(
      `[@umpire/json] Expression "contains" requires an array field, but "${field}" is declared "isEmpty": "${String(strategy)}"`,
    )
  }
}

// eslint-disable-next-line complexity -- closed-member and shape walk over a finite set of expression variants
function validateExpression(
  expression: unknown,
  fieldDefs: Record<string, JsonFieldDef>,
): void {
  if (!isPlainRecord(expression)) {
    throw new Error('[@umpire/json] Expression must be an object')
  }

  switch (expression.op) {
    case 'eq':
    case 'neq':
      assertKnownMembers(expression, ['op', 'field', 'value'], 'Expression')
      assertString(expression.field, `Expression "${expression.op}" field`)
      assertPrimitive(expression.value, `Expression "${expression.op}" value`)
      return
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      assertKnownMembers(expression, ['op', 'field', 'value'], 'Expression')
      assertString(expression.field, `Expression "${expression.op}" field`)
      assertNumber(expression.value, `Expression "${expression.op}" value`)
      return
    case 'present':
    case 'absent':
    case 'truthy':
    case 'falsy':
      assertKnownMembers(expression, ['op', 'field'], 'Expression')
      assertString(expression.field, `Expression "${expression.op}" field`)
      return
    case 'in':
    case 'notIn':
      assertKnownMembers(expression, ['op', 'field', 'values'], 'Expression')
      assertString(expression.field, `Expression "${expression.op}" field`)
      assertPrimitiveArray(
        expression.values,
        `Expression "${expression.op}" values`,
      )
      assertMembershipTarget(expression.op, expression.field, fieldDefs)
      return
    case 'contains':
      assertKnownMembers(expression, ['op', 'field', 'value'], 'Expression')
      assertString(expression.field, 'Expression "contains" field')
      assertPrimitive(expression.value, 'Expression "contains" value')
      assertMembershipTarget(expression.op, expression.field, fieldDefs)
      return
    case 'cond':
      assertKnownMembers(expression, ['op', 'condition'], 'Expression')
      assertString(expression.condition, 'Expression "cond" condition')
      return
    case 'condEq':
      assertKnownMembers(expression, ['op', 'condition', 'value'], 'Expression')
      assertString(expression.condition, 'Expression "condEq" condition')
      assertPrimitive(expression.value, 'Expression "condEq" value')
      return
    case 'condIn':
      assertKnownMembers(
        expression,
        ['op', 'condition', 'values'],
        'Expression',
      )
      assertString(expression.condition, 'Expression "condIn" condition')
      assertPrimitiveArray(expression.values, 'Expression "condIn" values')
      return
    case 'fieldInCond':
      assertKnownMembers(expression, ['op', 'field', 'condition'], 'Expression')
      assertString(expression.field, 'Expression "fieldInCond" field')
      assertString(expression.condition, 'Expression "fieldInCond" condition')
      assertMembershipTarget(expression.op, expression.field, fieldDefs)
      return
    case 'and':
    case 'or':
      assertKnownMembers(expression, ['op', 'exprs'], 'Expression')
      if (!Array.isArray(expression.exprs)) {
        throw new Error(
          `[@umpire/json] Expression "${expression.op}" exprs must be an array`,
        )
      }
      for (const entry of expression.exprs) {
        validateExpression(entry, fieldDefs)
      }
      return
    case 'not':
      assertKnownMembers(expression, ['op', 'expr'], 'Expression')
      validateExpression(expression.expr, fieldDefs)
      return
    case 'check':
      assertKnownMembers(expression, ['op', 'field', 'check'], 'Expression')
      assertString(expression.field, 'Expression "check" field')
      validateValidatorSpecMembers(expression.check)
      return
    default:
      throw new Error(
        `[@umpire/json] Unknown expression op "${String(expression.op)}"`,
      )
  }
}

function validateCondition(condition: string, definition: unknown) {
  if (!isPlainRecord(definition)) {
    throw new Error(
      `[@umpire/json] condition "${condition}" definition must be an object`,
    )
  }

  assertKnownMembers(
    definition,
    ['type', 'description'],
    'condition definition',
  )

  if (
    typeof definition.type !== 'string' ||
    !conditionTypes.has(definition.type)
  ) {
    throw new Error(
      `[@umpire/json] condition "${condition}" must use a supported type`,
    )
  }

  if (
    definition.description !== undefined &&
    typeof definition.description !== 'string'
  ) {
    throw new Error(
      `[@umpire/json] condition "${condition}" description must be a string when provided`,
    )
  }
}

function validateFieldDef(field: string, definition: JsonFieldDef) {
  if (!isPlainRecord(definition)) {
    throw new Error(
      `[@umpire/json] Field "${field}" definition must be an object`,
    )
  }

  assertKnownMembers(
    definition,
    ['required', 'default', 'isEmpty'],
    'field definition',
  )

  if (
    definition.required !== undefined &&
    typeof definition.required !== 'boolean'
  ) {
    throw new Error(
      `[@umpire/json] Field "${field}" required must be a boolean when provided`,
    )
  }

  if (
    definition.default !== undefined &&
    !isJsonPrimitive(definition.default)
  ) {
    throw new Error(
      `[@umpire/json] Field "${field}" has a non-serializable default value`,
    )
  }

  if (
    definition.isEmpty !== undefined &&
    !isJsonIsEmptyStrategy(definition.isEmpty)
  ) {
    throw new Error(
      `[@umpire/json] Unknown isEmpty strategy "${String(definition.isEmpty)}"`,
    )
  }
}

function validateExcludedRule(rule: ExcludedRule) {
  if (!isPlainRecord(rule)) {
    throw new Error('[@umpire/json] Excluded rule must be an object')
  }

  assertKnownMembers(
    rule,
    ['type', 'field', 'description', 'key', 'signature'],
    'Excluded rule',
  )

  if (typeof rule.type !== 'string' || rule.type.length === 0) {
    throw new Error(
      '[@umpire/json] Excluded rules must include a non-empty string type',
    )
  }

  if (rule.field !== undefined && typeof rule.field !== 'string') {
    throw new Error(
      '[@umpire/json] Excluded rule field must be a string when provided',
    )
  }

  if (typeof rule.description !== 'string' || rule.description.length === 0) {
    throw new Error(
      '[@umpire/json] Excluded rules must include a non-empty string description',
    )
  }

  if (rule.key !== undefined && typeof rule.key !== 'string') {
    throw new Error(
      '[@umpire/json] Excluded rule key must be a string when provided',
    )
  }

  if (rule.signature !== undefined && typeof rule.signature !== 'string') {
    throw new Error(
      '[@umpire/json] Excluded rule signature must be a string when provided',
    )
  }
}

function assertField(field: string, fieldNames: Set<string>, context: string) {
  if (!fieldNames.has(field)) {
    throw new Error(
      `[@umpire/json] Rule ${context} references unknown field "${field}"`,
    )
  }
}

function validateValidator(
  field: string,
  validator: JsonValidatorDef,
  fieldNames: Set<string>,
) {
  if (!fieldNames.has(field)) {
    throw new Error(
      `[@umpire/json] Validator references unknown field "${field}" (validator)`,
    )
  }

  if (!isPlainRecord(validator)) {
    throw new Error(
      `[@umpire/json] Validator for field "${field}" must be an object`,
    )
  }

  validateValidatorSpecMembers(validator, ['error'])

  if (validator.error !== undefined && typeof validator.error !== 'string') {
    throw new Error(
      `[@umpire/json] Validator for field "${field}" must use a string error when provided`,
    )
  }
}

function uniqueFields(fields: string[]): string[] {
  return [...new Set(fields)]
}

function getRuleConstraint(rule: JsonRule): JsonRuleConstraint {
  switch (rule.type) {
    case 'fairWhen':
    case 'check':
      return 'fair'
    case 'anyOf':
      return resolveCompositeShape('anyOf()', rule.rules).constraint
    case 'eitherOf':
      return resolveEitherOfShape(rule).constraint
    default:
      return 'enabled'
  }
}

function getRuleTargets(rule: JsonRule): string[] {
  switch (rule.type) {
    case 'requires':
    case 'enabledWhen':
    case 'fairWhen':
    case 'check':
      return [rule.field]
    case 'disables':
      return [...rule.targets]
    case 'oneOf':
      return uniqueFields(
        Object.values(rule.branches).flatMap((branchFields) => branchFields),
      )
    case 'anyOf':
      return resolveCompositeShape('anyOf()', rule.rules).targets
    case 'eitherOf':
      return resolveEitherOfShape(rule).targets
  }
}

function resolveCompositeShape(
  label: string,
  rules: JsonRule[],
): {
  targets: string[]
  constraint: JsonRuleConstraint
} {
  if (rules.length === 0) {
    throw new Error(`[@umpire/json] ${label} requires at least one rule`)
  }

  const expectedTargets = uniqueFields(getRuleTargets(rules[0])).sort()

  for (const rule of rules.slice(1)) {
    const currentTargets = uniqueFields(getRuleTargets(rule)).sort()

    if (
      currentTargets.length !== expectedTargets.length ||
      currentTargets.some((target, index) => target !== expectedTargets[index])
    ) {
      throw new Error(
        `[@umpire/json] ${label} rules must target the same fields`,
      )
    }
  }

  const constraint = getRuleConstraint(rules[0])

  for (const innerRule of rules.slice(1)) {
    if (getRuleConstraint(innerRule) !== constraint) {
      throw new Error(
        `[@umpire/json] ${label} cannot mix fairWhen rules with availability rules`,
      )
    }
  }

  return {
    targets: [...getRuleTargets(rules[0])],
    constraint,
  }
}

function resolveEitherOfShape(rule: Extract<JsonRule, { type: 'eitherOf' }>): {
  targets: string[]
  constraint: JsonRuleConstraint
} {
  const branchNames = Object.keys(rule.branches)

  if (branchNames.length === 0) {
    throw new Error(
      `[@umpire/json] eitherOf("${rule.group}") must include at least one branch`,
    )
  }

  for (const branchName of branchNames) {
    if (rule.branches[branchName].length === 0) {
      throw new Error(
        `[@umpire/json] eitherOf("${rule.group}") branch "${branchName}" must not be empty`,
      )
    }
  }

  return resolveCompositeShape(
    `eitherOf("${rule.group}")`,
    Object.values(rule.branches).flat(),
  )
}

function validateRuleMembers(rule: JsonRule) {
  switch (rule.type) {
    case 'requires':
      assertKnownMembers(
        rule,
        'dependency' in rule
          ? ['type', 'field', 'dependency', 'reason']
          : 'dependencies' in rule
            ? ['type', 'field', 'dependencies', 'reason']
            : ['type', 'field', 'when', 'reason'],
        'Rule',
      )
      return
    case 'enabledWhen':
    case 'fairWhen':
      assertKnownMembers(rule, ['type', 'field', 'when', 'reason'], 'Rule')
      return
    case 'disables':
      assertKnownMembers(
        rule,
        'source' in rule
          ? ['type', 'source', 'targets', 'reason']
          : ['type', 'when', 'targets', 'reason'],
        'Rule',
      )
      return
    case 'oneOf':
    case 'eitherOf':
      assertKnownMembers(rule, ['type', 'group', 'branches'], 'Rule')
      return
    case 'anyOf':
      assertKnownMembers(rule, ['type', 'rules'], 'Rule')
      return
    case 'check':
      assertKnownMembers(
        rule,
        ['type', 'field', 'reason', ...validatorSpecMembers(rule.op)],
        'Rule',
      )
      return
  }
}

// eslint-disable-next-line complexity -- one flat shape check per canonical rule variant
function validateRuleShape(
  rule: unknown,
  fieldDefs: Record<string, JsonFieldDef>,
): asserts rule is JsonRule {
  if (!isPlainRecord(rule)) {
    throw new Error('[@umpire/json] Rule must be an object')
  }

  validateRuleMembers(rule as JsonRule)

  if (rule.reason !== undefined) {
    assertString(rule.reason, 'Rule reason')
  }

  switch (rule.type) {
    case 'requires':
      assertString(rule.field, 'Rule "requires" field')
      if ('dependency' in rule) {
        assertString(rule.dependency, 'Rule "requires" dependency')
      } else if ('dependencies' in rule) {
        if (!Array.isArray(rule.dependencies)) {
          throw new Error(
            '[@umpire/json] Rule "requires" dependencies must be an array',
          )
        }
      } else {
        validateExpression(rule.when, fieldDefs)
      }
      return
    case 'enabledWhen':
    case 'fairWhen':
      assertString(rule.field, `Rule "${rule.type}" field`)
      validateExpression(rule.when, fieldDefs)
      return
    case 'disables':
      assertStringArray(rule.targets, 'Rule "disables" targets')
      if ('source' in rule) {
        assertString(rule.source, 'Rule "disables" source')
      } else {
        validateExpression(rule.when, fieldDefs)
      }
      return
    case 'oneOf':
      assertString(rule.group, 'Rule "oneOf" group')
      if (!isPlainRecord(rule.branches)) {
        throw new Error(
          '[@umpire/json] Rule "oneOf" branches must be an object',
        )
      }
      for (const [branch, fields] of Object.entries(rule.branches)) {
        assertStringArray(fields, `Rule "oneOf" branch "${branch}"`)
      }
      return
    case 'eitherOf':
      assertString(rule.group, 'Rule "eitherOf" group')
      if (!isPlainRecord(rule.branches)) {
        throw new Error(
          '[@umpire/json] Rule "eitherOf" branches must be an object',
        )
      }
      for (const [branch, rules] of Object.entries(rule.branches)) {
        if (!Array.isArray(rules)) {
          throw new Error(
            `[@umpire/json] Rule "eitherOf" branch "${branch}" must be an array`,
          )
        }
      }
      return
    case 'anyOf':
      if (!Array.isArray(rule.rules)) {
        throw new Error('[@umpire/json] Rule "anyOf" rules must be an array')
      }
      return
    case 'check':
      assertString(rule.field, 'Rule "check" field')
      validateValidatorSpecMembers(rule, ['type', 'field', 'reason'])
      return
    default:
      throw new Error(`[@umpire/json] Unknown rule type "${String(rule.type)}"`)
  }
}

type RuleValidationContext = {
  fieldNames: Set<string>
  fieldDefs: Record<string, JsonFieldDef>
  conditions: UmpireJsonSchema['conditions']
}

function validateRequiresRule(
  rule: Extract<JsonRule, { type: 'requires' }>,
  context: RuleValidationContext,
): void {
  const { fieldNames, fieldDefs, conditions } = context

  assertField(rule.field, fieldNames, '"requires"')

  if ('dependency' in rule) {
    assertField(rule.dependency, fieldNames, '"requires"')
    return
  }

  if ('dependencies' in rule) {
    if (!Array.isArray(rule.dependencies) || rule.dependencies.length === 0) {
      throw new Error(
        '[@umpire/json] "requires" rules with dependencies must include at least one entry',
      )
    }

    for (const dependency of rule.dependencies) {
      if (typeof dependency === 'string') {
        assertField(dependency, fieldNames, '"requires"')
        continue
      }

      validateExpression(dependency, fieldDefs)
      compileExpr(dependency, { fieldNames, conditions })
    }

    return
  }

  validateExpression(rule.when, fieldDefs)
  compileExpr(rule.when, { fieldNames, conditions })
}

function validateDisablesRule(
  rule: Extract<JsonRule, { type: 'disables' }>,
  context: RuleValidationContext,
): void {
  const { fieldNames, fieldDefs, conditions } = context

  for (const target of rule.targets) {
    assertField(target, fieldNames, '"disables"')
  }

  if ('source' in rule) {
    assertField(rule.source, fieldNames, '"disables"')
    return
  }

  validateExpression(rule.when, fieldDefs)
  compileExpr(rule.when, { fieldNames, conditions })
}

function validateRule(rule: unknown, context: RuleValidationContext) {
  const { fieldNames, fieldDefs, conditions } = context

  validateRuleShape(rule, fieldDefs)

  switch (rule.type) {
    case 'requires':
      validateRequiresRule(rule, context)
      return
    case 'enabledWhen':
      assertField(rule.field, fieldNames, '"enabledWhen"')
      validateExpression(rule.when, fieldDefs)
      compileExpr(rule.when, { fieldNames, conditions })
      return
    case 'disables':
      validateDisablesRule(rule, context)
      return
    case 'oneOf':
      for (const branchFields of Object.values(rule.branches)) {
        for (const field of branchFields) {
          assertField(field, fieldNames, '"oneOf"')
        }
      }
      return
    case 'fairWhen':
      assertField(rule.field, fieldNames, '"fairWhen"')
      validateExpression(rule.when, fieldDefs)
      compileExpr(rule.when, { fieldNames, conditions })
      return
    case 'eitherOf':
      for (const branchRules of Object.values(rule.branches)) {
        for (const innerRule of branchRules) {
          validateRule(innerRule, context)
        }
      }
      resolveEitherOfShape(rule)
      return
    case 'anyOf':
      for (const innerRule of rule.rules) {
        validateRule(innerRule, context)
      }
      resolveCompositeShape('anyOf()', rule.rules)
      return
    case 'check':
      assertField(rule.field, fieldNames, '"check"')
      assertValidCheckRule(rule)
      return
  }
}

// eslint-disable-next-line complexity -- sequential chain of guard-throws followed by flat iteration loops; no meaningful nesting, just input validation before delegation to typed helpers
export function validateSchema(
  schema: unknown,
): asserts schema is UmpireJsonSchema {
  if (!isPlainRecord(schema)) {
    throw new Error('[@umpire/json] Schema must be an object')
  }

  assertKnownMembers(
    schema,
    ['version', 'conditions', 'fields', 'rules', 'validators', 'excluded'],
    'Schema has unknown members; expected version, conditions, fields, rules, validators, excluded',
  )

  if (schema.version === undefined) {
    throw new Error('[@umpire/json] Schema must include a "version" field')
  }

  if (schema.version !== 1) {
    throw new Error(
      `[@umpire/json] Unsupported schema version "${String(schema.version)}"`,
    )
  }

  if (!isPlainRecord(schema.fields)) {
    throw new Error('[@umpire/json] Schema must include a "fields" object')
  }

  if (!Array.isArray(schema.rules)) {
    throw new Error('[@umpire/json] Schema must include a "rules" array')
  }

  if (schema.validators !== undefined && !isPlainRecord(schema.validators)) {
    throw new Error(
      '[@umpire/json] Schema "validators" must be an object when provided',
    )
  }

  if (schema.conditions !== undefined && !isPlainRecord(schema.conditions)) {
    throw new Error(
      '[@umpire/json] Schema "conditions" must be an object when provided',
    )
  }

  if (schema.excluded !== undefined && !Array.isArray(schema.excluded)) {
    throw new Error(
      '[@umpire/json] Schema "excluded" must be an array when provided',
    )
  }

  const typedSchema = schema as unknown as UmpireJsonSchema

  const fieldNames = new Set(Object.keys(typedSchema.fields))

  for (const [condition, definition] of Object.entries(
    typedSchema.conditions ?? {},
  )) {
    validateCondition(condition, definition)
  }

  for (const [field, definition] of Object.entries(typedSchema.fields)) {
    validateFieldDef(field, definition)
  }

  const context: RuleValidationContext = {
    fieldNames,
    fieldDefs: typedSchema.fields,
    conditions: typedSchema.conditions,
  }

  for (const rule of typedSchema.rules) {
    validateRule(rule, context)
  }

  for (const [field, validator] of Object.entries(
    typedSchema.validators ?? {},
  )) {
    validateValidator(field, validator, fieldNames)
  }

  for (const rule of typedSchema.excluded ?? []) {
    validateExcludedRule(rule)
  }

  if (fieldNames.size === 0) {
    throw new Error('[@umpire/json] Schema must include at least one field')
  }
}
