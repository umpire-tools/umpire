import { isEmptyPresent, type FieldDef, type FieldValues } from '@umpire/core'

import type { Expr } from './types.js'

type ExprPredicate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = ((values: FieldValues<F>, conditions: C) => boolean) & {
  _checkField?: keyof F & string
}

type ExprConditionDef = {
  type: 'boolean' | 'string' | 'number' | 'string[]' | 'number[]'
}

type CompileExprOptions = {
  allowUndeclaredConditions?: boolean
  fieldNames: Set<string>
  conditions?: Record<string, ExprConditionDef>
}

function assertField(field: string, op: string, fieldNames: Set<string>) {
  if (!fieldNames.has(field)) {
    throw new Error(`[@umpire/dsl] Unknown field "${field}" in "${op}" expression`)
  }
}

function getConditionDef(
  condition: string,
  op: string,
  conditions: Record<string, ExprConditionDef> | undefined,
): ExprConditionDef {
  const definition = conditions?.[condition]

  if (!definition) {
    throw new Error(`[@umpire/dsl] Unknown condition "${condition}" in "${op}" expression`)
  }

  return definition
}

function getConditionValue<C extends Record<string, unknown>>(condition: string, conditions: C): unknown {
  if (!(condition in conditions) || conditions[condition] === undefined) {
    throw new Error(`[@umpire/dsl] Missing runtime condition "${condition}"`)
  }

  return conditions[condition]
}

function collectFieldRefs(expression: Expr): string[] {
  switch (expression.op) {
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
    case 'fieldInCond':
      return [expression.field]
    case 'and':
    case 'or':
      return expression.exprs.flatMap(collectFieldRefs)
    case 'not':
      return collectFieldRefs(expression.expr)
    case 'cond':
    case 'condEq':
    case 'condIn':
      return []
    default:
      return []
  }
}

export function getExprFieldRefs(expression: Expr): string[] {
  return [...new Set(collectFieldRefs(expression))]
}

function compileInner<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  expression: Expr,
  options: CompileExprOptions,
): (values: FieldValues<F>, conditions: C) => boolean {
  switch (expression.op) {
    case 'eq':
      assertField(expression.field, expression.op, options.fieldNames)
      return (values) => values[expression.field as keyof F & string] === expression.value
    case 'neq':
      assertField(expression.field, expression.op, options.fieldNames)
      return (values) => values[expression.field as keyof F & string] !== expression.value
    case 'gt':
      assertField(expression.field, expression.op, options.fieldNames)
      return (values) =>
        typeof values[expression.field as keyof F & string] === 'number' &&
        (values[expression.field as keyof F & string] as number) > expression.value
    case 'gte':
      assertField(expression.field, expression.op, options.fieldNames)
      return (values) =>
        typeof values[expression.field as keyof F & string] === 'number' &&
        (values[expression.field as keyof F & string] as number) >= expression.value
    case 'lt':
      assertField(expression.field, expression.op, options.fieldNames)
      return (values) =>
        typeof values[expression.field as keyof F & string] === 'number' &&
        (values[expression.field as keyof F & string] as number) < expression.value
    case 'lte':
      assertField(expression.field, expression.op, options.fieldNames)
      return (values) =>
        typeof values[expression.field as keyof F & string] === 'number' &&
        (values[expression.field as keyof F & string] as number) <= expression.value
    case 'present':
      assertField(expression.field, expression.op, options.fieldNames)
      return (values) => {
        const value = values[expression.field as keyof F & string]
        return !isEmptyPresent(value)
      }
    case 'absent':
      assertField(expression.field, expression.op, options.fieldNames)
      return (values) => {
        const value = values[expression.field as keyof F & string]
        return isEmptyPresent(value)
      }
    case 'truthy':
      assertField(expression.field, expression.op, options.fieldNames)
      return (values) => Boolean(values[expression.field as keyof F & string])
    case 'falsy':
      assertField(expression.field, expression.op, options.fieldNames)
      return (values) => !values[expression.field as keyof F & string]
    case 'in':
      assertField(expression.field, expression.op, options.fieldNames)
      return (values) => expression.values.includes(values[expression.field as keyof F & string] as never)
    case 'notIn':
      assertField(expression.field, expression.op, options.fieldNames)
      return (values) => !expression.values.includes(values[expression.field as keyof F & string] as never)
    case 'cond':
      if (!options.allowUndeclaredConditions) {
        getConditionDef(expression.condition, expression.op, options.conditions)
      }
      return (_values, conditions) => Boolean(getConditionValue(expression.condition, conditions))
    case 'condEq':
      if (!options.allowUndeclaredConditions) {
        getConditionDef(expression.condition, expression.op, options.conditions)
      }
      return (_values, conditions) => getConditionValue(expression.condition, conditions) === expression.value
    case 'condIn':
      if (!options.allowUndeclaredConditions) {
        getConditionDef(expression.condition, expression.op, options.conditions)
      }
      return (_values, conditions) =>
        expression.values.includes(getConditionValue(expression.condition, conditions) as never)
    case 'fieldInCond': {
      assertField(expression.field, expression.op, options.fieldNames)
      if (!options.allowUndeclaredConditions) {
        const conditionDef = getConditionDef(expression.condition, expression.op, options.conditions)

        if (conditionDef.type !== 'string[]' && conditionDef.type !== 'number[]') {
          throw new Error(
            `[@umpire/dsl] "fieldInCond" requires an array condition, but "${expression.condition}" is "${conditionDef.type}"`,
          )
        }
      }

      return (values, conditions) => {
        const conditionValue = getConditionValue(expression.condition, conditions)
        if (!Array.isArray(conditionValue)) {
          throw new Error(
            `[@umpire/dsl] Runtime condition "${expression.condition}" must be an array for "fieldInCond"`,
          )
        }

        return conditionValue.includes(values[expression.field as keyof F & string] as never)
      }
    }
    case 'and': {
      if (!Array.isArray(expression.exprs)) {
        throw new Error('[@umpire/dsl] "and" expression requires an exprs array')
      }
      const predicates = expression.exprs.map((entry) => compileInner<F, C>(entry, options))
      return (values, conditions) => predicates.every((predicate) => predicate(values, conditions))
    }
    case 'or': {
      if (!Array.isArray(expression.exprs)) {
        throw new Error('[@umpire/dsl] "or" expression requires an exprs array')
      }
      const predicates = expression.exprs.map((entry) => compileInner<F, C>(entry, options))
      return (values, conditions) => predicates.some((predicate) => predicate(values, conditions))
    }
    case 'not': {
      const predicate = compileInner<F, C>(expression.expr, options)
      return (values, conditions) => !predicate(values, conditions)
    }
    default:
      throw new Error(
        `[@umpire/dsl] Unknown expression op "${String((expression as { op?: unknown }).op)}"`,
      )
  }
}

export function compileExpr<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  expression: Expr,
  options: CompileExprOptions,
): ExprPredicate<F, C> {
  const predicate = compileInner<F, C>(expression, options) as ExprPredicate<F, C>
  const fieldRefs = getExprFieldRefs(expression)

  if (fieldRefs.length === 1) {
    predicate._checkField = fieldRefs[0] as keyof F & string
  }

  return predicate
}
