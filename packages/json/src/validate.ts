import type {
  ExcludedRule,
  UmpireJsonSchema,
  JsonRule,
  JsonFieldDef,
  JsonValidatorDef,
} from './schema.js'
import { assertValidCheckRule, assertValidValidatorSpec } from './check-ops.js'
import { compileExpr } from './expr.js'
import { isJsonIsEmptyStrategy } from './strategies.js'

type JsonRuleConstraint = 'enabled' | 'fair'

function isJsonPrimitive(value: unknown): boolean {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function validateFieldDef(field: string, definition: JsonFieldDef) {
  if (definition.default !== undefined && !isJsonPrimitive(definition.default)) {
    throw new Error(`[umpire/json] Field "${field}" has a non-serializable default value`)
  }

  if (
    definition.isEmpty !== undefined &&
    !isJsonIsEmptyStrategy(definition.isEmpty)
  ) {
    throw new Error(`[umpire/json] Unknown isEmpty strategy "${String(definition.isEmpty)}"`)
  }
}

function validateExcludedRule(rule: ExcludedRule) {
  if (typeof rule.type !== 'string' || rule.type.length === 0) {
    throw new Error('[umpire/json] Excluded rules must include a non-empty string type')
  }

  if (rule.field !== undefined && typeof rule.field !== 'string') {
    throw new Error('[umpire/json] Excluded rule field must be a string when provided')
  }

  if (typeof rule.description !== 'string' || rule.description.length === 0) {
    throw new Error('[umpire/json] Excluded rules must include a non-empty string description')
  }

  if (rule.key !== undefined && typeof rule.key !== 'string') {
    throw new Error('[umpire/json] Excluded rule key must be a string when provided')
  }

  if (rule.signature !== undefined && typeof rule.signature !== 'string') {
    throw new Error('[umpire/json] Excluded rule signature must be a string when provided')
  }
}

function assertField(field: string, fieldNames: Set<string>, context: string) {
  if (!fieldNames.has(field)) {
    throw new Error(`[umpire/json] Rule ${context} references unknown field "${field}"`)
  }
}

function validateValidator(field: string, validator: JsonValidatorDef, fieldNames: Set<string>) {
  if (!fieldNames.has(field)) {
    throw new Error(`[umpire/json] Validator references unknown field "${field}"`)
  }

  assertValidValidatorSpec(validator)

  if (validator.error !== undefined && typeof validator.error !== 'string') {
    throw new Error(`[umpire/json] Validator for field "${field}" must use a string error when provided`)
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
      return uniqueFields(Object.values(rule.branches).flatMap((branchFields) => branchFields))
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
    throw new Error(`[umpire/json] ${label} requires at least one rule`)
  }

  const expectedTargets = uniqueFields(getRuleTargets(rules[0])).sort()

  for (const rule of rules.slice(1)) {
    const currentTargets = uniqueFields(getRuleTargets(rule)).sort()

    if (
      currentTargets.length !== expectedTargets.length ||
      currentTargets.some((target, index) => target !== expectedTargets[index])
    ) {
      throw new Error(`[umpire/json] ${label} rules must target the same fields`)
    }
  }

  const constraint = getRuleConstraint(rules[0])

  for (const innerRule of rules.slice(1)) {
    if (getRuleConstraint(innerRule) !== constraint) {
      throw new Error(`[umpire/json] ${label} cannot mix fairWhen rules with availability rules`)
    }
  }

  return {
    targets: [...getRuleTargets(rules[0])],
    constraint,
  }
}

function resolveEitherOfShape(
  rule: Extract<JsonRule, { type: 'eitherOf' }>,
): {
  targets: string[]
  constraint: JsonRuleConstraint
} {
  const branchNames = Object.keys(rule.branches)

  if (branchNames.length === 0) {
    throw new Error(`[umpire/json] eitherOf("${rule.group}") must include at least one branch`)
  }

  for (const branchName of branchNames) {
    if (rule.branches[branchName].length === 0) {
      throw new Error(`[umpire/json] eitherOf("${rule.group}") branch "${branchName}" must not be empty`)
    }
  }

  return resolveCompositeShape(`eitherOf("${rule.group}")`, Object.values(rule.branches).flat())
}

function validateRule(
  rule: JsonRule,
  fieldNames: Set<string>,
  conditions: UmpireJsonSchema['conditions'],
) {
  switch (rule.type) {
    case 'requires':
      assertField(rule.field, fieldNames, '"requires"')
      if ('dependency' in rule) {
        assertField(rule.dependency, fieldNames, '"requires"')
        return
      }

      if ('dependencies' in rule) {
        if (!Array.isArray(rule.dependencies) || rule.dependencies.length === 0) {
          throw new Error('[umpire/json] "requires" rules with dependencies must include at least one entry')
        }

        for (const dependency of rule.dependencies) {
          if (typeof dependency === 'string') {
            assertField(dependency, fieldNames, '"requires"')
            continue
          }

          compileExpr(dependency, { fieldNames, conditions })
        }

        return
      }

      compileExpr(rule.when, { fieldNames, conditions })
      return
    case 'enabledWhen':
      assertField(rule.field, fieldNames, '"enabledWhen"')
      compileExpr(rule.when, { fieldNames, conditions })
      return
    case 'disables':
      for (const target of rule.targets) {
        assertField(target, fieldNames, '"disables"')
      }

      if ('source' in rule) {
        assertField(rule.source, fieldNames, '"disables"')
        return
      }

      compileExpr(rule.when, { fieldNames, conditions })
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
      compileExpr(rule.when, { fieldNames, conditions })
      return
    case 'eitherOf':
      resolveEitherOfShape(rule)
      for (const branchRules of Object.values(rule.branches)) {
        for (const innerRule of branchRules) {
          validateRule(innerRule, fieldNames, conditions)
        }
      }
      return
    case 'anyOf':
      resolveCompositeShape('anyOf()', rule.rules)
      for (const innerRule of rule.rules) {
        validateRule(innerRule, fieldNames, conditions)
      }
      return
    case 'check':
      assertField(rule.field, fieldNames, '"check"')
      assertValidCheckRule(rule)
      return
    default:
      throw new Error(`[umpire/json] Unknown rule type "${String((rule as { type?: unknown }).type)}"`)
  }
}

export function validateSchema(schema: UmpireJsonSchema): void {
  if (schema.version !== 1) {
    throw new Error(`[umpire/json] Unsupported schema version "${String(schema.version)}"`)
  }

  const fieldNames = new Set(Object.keys(schema.fields ?? {}))

  for (const [field, definition] of Object.entries(schema.fields ?? {})) {
    validateFieldDef(field, definition)
  }

  for (const rule of schema.rules ?? []) {
    validateRule(rule, fieldNames, schema.conditions)
  }

  for (const [field, validator] of Object.entries(schema.validators ?? {})) {
    validateValidator(field, validator, fieldNames)
  }

  for (const rule of schema.excluded ?? []) {
    validateExcludedRule(rule)
  }
}
