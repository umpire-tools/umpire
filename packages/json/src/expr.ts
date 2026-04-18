import {
  compileExpr as compileDslExpr,
  getExprFieldRefs as getDslExprFieldRefs,
  type Expr,
} from '@umpire/dsl'
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
    throw new Error(`[@umpire/json] Unknown field "${field}" in "${op}" expression`)
  }
}

export function getExprFieldRefs(expression: JsonExpr): string[] {
  if (expression.op === 'check') {
    return [expression.field]
  }

  if (expression.op === 'and' || expression.op === 'or') {
    return [...new Set(expression.exprs.flatMap((entry) => getExprFieldRefs(entry)))]
  }

  if (expression.op === 'not') {
    return getExprFieldRefs(expression.expr)
  }

  return getDslExprFieldRefs(expression)
}

type CompiledNode<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  predicate: ExprPredicate<F, C>
  fieldRefs: Set<string>
}

function compileCheckExpr<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  expression: Extract<JsonExpr, { op: 'check' }>,
  options: CompileExprOptions,
): ExprPredicate<F, C> {
  assertField(expression.field, expression.op, options.fieldNames)
  assertValidValidatorSpec(expression.check)

  const validator = createNamedValidatorFromSpec(expression.check)

  const predicate = ((values) => {
    const value = values[expression.field as keyof F & string]

    return value != null && validator.validate(value as never)
  }) as ExprPredicate<F, C>

  predicate._checkField = expression.field as keyof F & string
  predicate._namedCheck = getNamedCheckMetadata(validator)

  return predicate
}

export function compileExpr<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  expression: JsonExpr,
  options: CompileExprOptions,
): ExprPredicate<F, C> {
  const compiled = compileInner<F, C>(expression, options)

  if (compiled.fieldRefs.size === 1) {
    compiled.predicate._checkField = [...compiled.fieldRefs][0] as keyof F & string
  }

  return compiled.predicate
}

function compileInner<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  expression: JsonExpr,
  options: CompileExprOptions,
): CompiledNode<F, C> {
  if (expression.op === 'check') {
    return {
      predicate: compileCheckExpr<F, C>(expression, options),
      fieldRefs: new Set([expression.field]),
    }
  }

  if (expression.op === 'and') {
    if (!Array.isArray(expression.exprs)) {
      throw new Error('[@umpire/json] "and" expression requires an exprs array')
    }

    const compiledEntries = expression.exprs.map((entry) => compileInner<F, C>(entry, options))
    const predicates = compiledEntries.map((entry) => entry.predicate)
    return {
      predicate: (((values: FieldValues<F>, conditions: C) =>
        predicates.every((entry) => entry(values, conditions))) as ExprPredicate<F, C>),
      fieldRefs: new Set(compiledEntries.flatMap((entry) => [...entry.fieldRefs])),
    }
  }

  if (expression.op === 'or') {
    if (!Array.isArray(expression.exprs)) {
      throw new Error('[@umpire/json] "or" expression requires an exprs array')
    }

    const compiledEntries = expression.exprs.map((entry) => compileInner<F, C>(entry, options))
    const predicates = compiledEntries.map((entry) => entry.predicate)
    return {
      predicate: (((values: FieldValues<F>, conditions: C) =>
        predicates.some((entry) => entry(values, conditions))) as ExprPredicate<F, C>),
      fieldRefs: new Set(compiledEntries.flatMap((entry) => [...entry.fieldRefs])),
    }
  }

  if (expression.op === 'not') {
    const inner = compileInner<F, C>(expression.expr, options)
    return {
      predicate: (((values: FieldValues<F>, conditions: C) =>
        !inner.predicate(values, conditions)) as ExprPredicate<F, C>),
      fieldRefs: inner.fieldRefs,
    }
  }

  return {
    predicate: compileDslExpr<F, C>(expression as Expr, options),
    fieldRefs: new Set(getDslExprFieldRefs(expression as Expr)),
  }
}
