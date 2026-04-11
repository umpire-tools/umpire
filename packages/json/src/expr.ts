import { getNamedCheckMetadata, type FieldDef, type FieldValues, type NamedCheckMetadata } from '@umpire/core'

import { assertValidValidatorSpec, createNamedValidatorFromSpec } from './check-ops.js'
import type { JsonConditionDef, JsonExpr } from './schema.js'

type ExprPredicate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = ((values: FieldValues<F>, conditions: C) => boolean) & {
  _checkField?: keyof F & string
  _namedCheck?: NamedCheckMetadata
}

type CompileExprOptions = {
  allowUndeclaredConditions?: boolean
  fieldNames: Set<string>
  conditions?: Record<string, JsonConditionDef>
}

function assertField(field: string, op: string, fieldNames: Set<string>) {
  if (!fieldNames.has(field)) {
    throw new Error(`[umpire/json] Unknown field "${field}" in "${op}" expression`)
  }
}

function getConditionDef(
  condition: string,
  op: string,
  conditions: Record<string, JsonConditionDef> | undefined,
): JsonConditionDef {
  const definition = conditions?.[condition]

  if (!definition) {
    throw new Error(`[umpire/json] Unknown condition "${condition}" in "${op}" expression`)
  }

  return definition
}

function getConditionValue<C extends Record<string, unknown>>(condition: string, conditions: C): unknown {
  if (!(condition in conditions) || conditions[condition] === undefined) {
    throw new Error(`[umpire/json] Missing runtime condition "${condition}"`)
  }

  return conditions[condition]
}

function collectFieldRefs(expr: JsonExpr): string[] {
  switch (expr.op) {
    case 'eq':
    case 'neq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
    case 'present':
    case 'absent':
    case 'truthy':
    case 'falsy':
    case 'in':
    case 'notIn':
    case 'check':
      return [expr.field]
    case 'fieldInCond':
      return [expr.field]
    case 'and':
    case 'or':
      return expr.exprs.flatMap(collectFieldRefs)
    case 'not':
      return collectFieldRefs(expr.expr)
    case 'cond':
    case 'condEq':
    case 'condIn':
      return []
    default:
      return []
  }
}

export function getExprFieldRefs(expr: JsonExpr): string[] {
  return [...new Set(collectFieldRefs(expr))]
}

function compileInner<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  expr: JsonExpr,
  options: CompileExprOptions,
): (values: FieldValues<F>, conditions: C) => boolean {
  switch (expr.op) {
    case 'eq':
      assertField(expr.field, expr.op, options.fieldNames)
      return (values) => values[expr.field as keyof F & string] === expr.value
    case 'neq':
      assertField(expr.field, expr.op, options.fieldNames)
      return (values) => values[expr.field as keyof F & string] !== expr.value
    case 'gt':
      assertField(expr.field, expr.op, options.fieldNames)
      return (values) =>
        typeof values[expr.field as keyof F & string] === 'number' &&
        (values[expr.field as keyof F & string] as number) > expr.value
    case 'gte':
      assertField(expr.field, expr.op, options.fieldNames)
      return (values) =>
        typeof values[expr.field as keyof F & string] === 'number' &&
        (values[expr.field as keyof F & string] as number) >= expr.value
    case 'lt':
      assertField(expr.field, expr.op, options.fieldNames)
      return (values) =>
        typeof values[expr.field as keyof F & string] === 'number' &&
        (values[expr.field as keyof F & string] as number) < expr.value
    case 'lte':
      assertField(expr.field, expr.op, options.fieldNames)
      return (values) =>
        typeof values[expr.field as keyof F & string] === 'number' &&
        (values[expr.field as keyof F & string] as number) <= expr.value
    case 'present':
      assertField(expr.field, expr.op, options.fieldNames)
      return (values) => {
        const value = values[expr.field as keyof F & string]
        return value !== null && value !== undefined
      }
    case 'absent':
      assertField(expr.field, expr.op, options.fieldNames)
      return (values) => {
        const value = values[expr.field as keyof F & string]
        return value === null || value === undefined
      }
    case 'truthy':
      assertField(expr.field, expr.op, options.fieldNames)
      return (values) => Boolean(values[expr.field as keyof F & string])
    case 'falsy':
      assertField(expr.field, expr.op, options.fieldNames)
      return (values) => !values[expr.field as keyof F & string]
    case 'in':
      assertField(expr.field, expr.op, options.fieldNames)
      return (values) => expr.values.includes(values[expr.field as keyof F & string] as never)
    case 'notIn':
      assertField(expr.field, expr.op, options.fieldNames)
      return (values) => !expr.values.includes(values[expr.field as keyof F & string] as never)
    case 'check': {
      assertField(expr.field, expr.op, options.fieldNames)
      assertValidValidatorSpec(expr.check)
      const validator = createNamedValidatorFromSpec(expr.check)

      return (values) => {
        const value = values[expr.field as keyof F & string]

        return value != null && validator.validate(value as never)
      }
    }
    case 'cond':
      if (!options.allowUndeclaredConditions) {
        getConditionDef(expr.condition, expr.op, options.conditions)
      }
      return (_values, conditions) => Boolean(getConditionValue(expr.condition, conditions))
    case 'condEq':
      if (!options.allowUndeclaredConditions) {
        getConditionDef(expr.condition, expr.op, options.conditions)
      }
      return (_values, conditions) => getConditionValue(expr.condition, conditions) === expr.value
    case 'condIn':
      if (!options.allowUndeclaredConditions) {
        getConditionDef(expr.condition, expr.op, options.conditions)
      }
      return (_values, conditions) =>
        expr.values.includes(getConditionValue(expr.condition, conditions) as never)
    case 'fieldInCond': {
      assertField(expr.field, expr.op, options.fieldNames)
      if (!options.allowUndeclaredConditions) {
        const conditionDef = getConditionDef(expr.condition, expr.op, options.conditions)

        if (conditionDef.type !== 'string[]' && conditionDef.type !== 'number[]') {
          throw new Error(
            `[umpire/json] "fieldInCond" requires an array condition, but "${expr.condition}" is "${conditionDef.type}"`,
          )
        }
      }

      return (values, conditions) => {
        const conditionValue = getConditionValue(expr.condition, conditions)
        if (!Array.isArray(conditionValue)) {
          throw new Error(
            `[umpire/json] Runtime condition "${expr.condition}" must be an array for "fieldInCond"`,
          )
        }

        return conditionValue.includes(values[expr.field as keyof F & string] as never)
      }
    }
    case 'and': {
      if (!Array.isArray(expr.exprs)) {
        throw new Error('[umpire/json] "and" expression requires an exprs array')
      }
      const predicates = expr.exprs.map((entry) => compileInner<F, C>(entry, options))
      return (values, conditions) => predicates.every((predicate) => predicate(values, conditions))
    }
    case 'or': {
      if (!Array.isArray(expr.exprs)) {
        throw new Error('[umpire/json] "or" expression requires an exprs array')
      }
      const predicates = expr.exprs.map((entry) => compileInner<F, C>(entry, options))
      return (values, conditions) => predicates.some((predicate) => predicate(values, conditions))
    }
    case 'not': {
      const predicate = compileInner<F, C>(expr.expr, options)
      return (values, conditions) => !predicate(values, conditions)
    }
    default:
      throw new Error(`[umpire/json] Unknown expression op "${String((expr as { op?: unknown }).op)}"`)
  }
}

export function compileExpr<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  expr: JsonExpr,
  options: CompileExprOptions,
): ExprPredicate<F, C> {
  const predicate = compileInner<F, C>(expr, options) as ExprPredicate<F, C>
  const fieldRefs = getExprFieldRefs(expr)

  if (fieldRefs.length === 1) {
    predicate._checkField = fieldRefs[0] as keyof F & string
  }

  if (expr.op === 'check') {
    predicate._namedCheck = getNamedCheckMetadata(createNamedValidatorFromSpec(expr.check))
  }

  return predicate
}
