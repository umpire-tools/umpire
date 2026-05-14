import { compileExpr } from '@umpire/dsl'
import type { Expr } from '@umpire/dsl'
import type { JsonPrimitive } from '@umpire/core'

export function getValuePropNames(): string[] {
  return [
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'in',
    'notIn',
    'truthy',
    'falsy',
  ]
}

export function buildValueExpr(
  dep: string,
  props: Record<string, unknown>,
): Expr {
  const exprs: Expr[] = []

  if (props.eq !== undefined)
    exprs.push({ op: 'eq', field: dep, value: props.eq as JsonPrimitive })
  if (props.neq !== undefined)
    exprs.push({ op: 'neq', field: dep, value: props.neq as JsonPrimitive })
  if (props.gt !== undefined)
    exprs.push({ op: 'gt', field: dep, value: props.gt as number })
  if (props.gte !== undefined)
    exprs.push({ op: 'gte', field: dep, value: props.gte as number })
  if (props.lt !== undefined)
    exprs.push({ op: 'lt', field: dep, value: props.lt as number })
  if (props.lte !== undefined)
    exprs.push({ op: 'lte', field: dep, value: props.lte as number })
  if (props.in !== undefined)
    exprs.push({
      op: 'in',
      field: dep,
      values: [...(props.in as JsonPrimitive[])],
    })
  if (props.notIn !== undefined)
    exprs.push({
      op: 'notIn',
      field: dep,
      values: [...(props.notIn as JsonPrimitive[])],
    })
  if (props.truthy !== undefined) exprs.push({ op: 'truthy', field: dep })
  if (props.falsy !== undefined) exprs.push({ op: 'falsy', field: dep })

  if (exprs.length === 0) {
    throw new Error(
      '[@umpire/jsx] buildValueExpr requires at least one value prop',
    )
  }
  if (exprs.length === 1) return exprs[0]
  return { op: 'and', exprs }
}

export function buildRequiresPredicate(
  dep: string,
  props: Record<string, unknown>,
  fieldNames: Set<string>,
) {
  const expr = buildValueExpr(dep, props)
  return compileExpr(expr, { fieldNames })
}

export function compileWhenPredicate(when: Expr, fieldNames: Set<string>) {
  return compileExpr(when, { fieldNames })
}
