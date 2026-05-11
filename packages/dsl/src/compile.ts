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
    throw new Error(
      `[@umpire/dsl] Unknown field "${field}" in "${op}" expression`,
    )
  }
}

function getConditionDef(
  condition: string,
  op: string,
  conditions: Record<string, ExprConditionDef> | undefined,
): ExprConditionDef {
  const definition = conditions?.[condition]

  if (!definition) {
    throw new Error(
      `[@umpire/dsl] Unknown condition "${condition}" in "${op}" expression`,
    )
  }

  return definition
}

function getConditionValue<C extends Record<string, unknown>>(
  condition: string,
  conditions: C,
): unknown {
  if (!(condition in conditions) || conditions[condition] === undefined) {
    throw new Error(`[@umpire/dsl] Missing runtime condition "${condition}"`)
  }

  return conditions[condition]
}

// eslint-disable-next-line complexity -- exhaustive switch over a discriminated union; fall-through case labels each count as a branch but all paths are flat single-line returns
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
  const fieldPredicate = compileFieldPredicate<F>(expression, options)
  if (fieldPredicate) {
    return fieldPredicate as (values: FieldValues<F>, conditions: C) => boolean
  }

  const conditionPredicate = compileConditionPredicate<C>(expression, options)
  if (conditionPredicate) {
    return conditionPredicate as (
      values: FieldValues<F>,
      conditions: C,
    ) => boolean
  }

  switch (expression.op) {
    case 'fieldInCond': {
      assertField(expression.field, expression.op, options.fieldNames)
      if (!options.allowUndeclaredConditions) {
        const conditionDef = getConditionDef(
          expression.condition,
          expression.op,
          options.conditions,
        )

        if (
          conditionDef.type !== 'string[]' &&
          conditionDef.type !== 'number[]'
        ) {
          throw new Error(
            `[@umpire/dsl] "fieldInCond" requires an array condition, but "${expression.condition}" is "${conditionDef.type}"`,
          )
        }
      }

      return (values, conditions) => {
        const conditionValue = getConditionValue(
          expression.condition,
          conditions,
        )
        if (!Array.isArray(conditionValue)) {
          throw new Error(
            `[@umpire/dsl] Runtime condition "${expression.condition}" must be an array for "fieldInCond"`,
          )
        }

        return conditionValue.includes(
          values[expression.field as keyof F & string] as never,
        )
      }
    }
    case 'and': {
      if (!Array.isArray(expression.exprs)) {
        throw new Error(
          '[@umpire/dsl] "and" expression requires an exprs array',
        )
      }
      const predicates = expression.exprs.map((entry) =>
        compileInner<F, C>(entry, options),
      )
      return (values, conditions) =>
        predicates.every((predicate) => predicate(values, conditions))
    }
    case 'or': {
      if (!Array.isArray(expression.exprs)) {
        throw new Error('[@umpire/dsl] "or" expression requires an exprs array')
      }
      const predicates = expression.exprs.map((entry) =>
        compileInner<F, C>(entry, options),
      )
      return (values, conditions) =>
        predicates.some((predicate) => predicate(values, conditions))
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

function makeFieldPredicate<F extends Record<string, FieldDef>>(
  field: string,
  op: string,
  options: CompileExprOptions,
  test: (value: unknown) => boolean,
): (values: FieldValues<F>, conditions: never) => boolean {
  assertField(field, op, options.fieldNames)
  return (values) => test(values[field as keyof F & string])
}

function compileFieldPredicate<F extends Record<string, FieldDef>>(
  expression: Expr,
  options: CompileExprOptions,
): ((values: FieldValues<F>, conditions: never) => boolean) | null {
  switch (expression.op) {
    case 'eq':
      return makeFieldPredicate<F>(
        expression.field,
        expression.op,
        options,
        (value) => value === expression.value,
      )
    case 'neq':
      return makeFieldPredicate<F>(
        expression.field,
        expression.op,
        options,
        (value) => value !== expression.value,
      )
    case 'gt':
      return makeFieldPredicate<F>(
        expression.field,
        expression.op,
        options,
        (value) => typeof value === 'number' && value > expression.value,
      )
    case 'gte':
      return makeFieldPredicate<F>(
        expression.field,
        expression.op,
        options,
        (value) => typeof value === 'number' && value >= expression.value,
      )
    case 'lt':
      return makeFieldPredicate<F>(
        expression.field,
        expression.op,
        options,
        (value) => typeof value === 'number' && value < expression.value,
      )
    case 'lte':
      return makeFieldPredicate<F>(
        expression.field,
        expression.op,
        options,
        (value) => typeof value === 'number' && value <= expression.value,
      )
    case 'present':
      return makeFieldPredicate<F>(
        expression.field,
        expression.op,
        options,
        (value) => !isEmptyPresent(value),
      )
    case 'absent':
      return makeFieldPredicate<F>(
        expression.field,
        expression.op,
        options,
        (value) => isEmptyPresent(value),
      )
    case 'truthy':
      return makeFieldPredicate<F>(
        expression.field,
        expression.op,
        options,
        (value) => Boolean(value),
      )
    case 'falsy':
      return makeFieldPredicate<F>(
        expression.field,
        expression.op,
        options,
        (value) => !value,
      )
    case 'in':
      return makeFieldPredicate<F>(
        expression.field,
        expression.op,
        options,
        (value) => expression.values.includes(value as never),
      )
    case 'notIn':
      return makeFieldPredicate<F>(
        expression.field,
        expression.op,
        options,
        (value) => !expression.values.includes(value as never),
      )
    default:
      return null
  }
}

function compileConditionPredicate<C extends Record<string, unknown>>(
  expression: Expr,
  options: CompileExprOptions,
): ((values: never, conditions: C) => boolean) | null {
  switch (expression.op) {
    case 'cond':
      if (!options.allowUndeclaredConditions) {
        getConditionDef(expression.condition, expression.op, options.conditions)
      }
      return (_values, conditions) =>
        Boolean(getConditionValue(expression.condition, conditions))
    case 'condEq':
      if (!options.allowUndeclaredConditions) {
        getConditionDef(expression.condition, expression.op, options.conditions)
      }
      return (_values, conditions) =>
        getConditionValue(expression.condition, conditions) === expression.value
    case 'condIn':
      if (!options.allowUndeclaredConditions) {
        getConditionDef(expression.condition, expression.op, options.conditions)
      }
      return (_values, conditions) =>
        expression.values.includes(
          getConditionValue(expression.condition, conditions) as never,
        )
    default:
      return null
  }
}

export function compileExpr<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(expression: Expr, options: CompileExprOptions): ExprPredicate<F, C> {
  const predicate = compileInner<F, C>(expression, options) as ExprPredicate<
    F,
    C
  >
  const fieldRefs = getExprFieldRefs(expression)

  if (fieldRefs.length === 1) {
    predicate._checkField = fieldRefs[0] as keyof F & string
  }

  return predicate
}
