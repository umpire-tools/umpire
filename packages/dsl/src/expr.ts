import type { FieldDef } from '@umpire/core'
import { cloneJson } from '@umpire/core/json'

import type { ExprBuilder } from './types.js'

export const expr: ExprBuilder<Record<string, FieldDef>, Record<string, unknown>> = {
  eq(field, value) {
    return { op: 'eq', field, value }
  },
  neq(field, value) {
    return { op: 'neq', field, value }
  },
  gt(field, value) {
    return { op: 'gt', field, value }
  },
  gte(field, value) {
    return { op: 'gte', field, value }
  },
  lt(field, value) {
    return { op: 'lt', field, value }
  },
  lte(field, value) {
    return { op: 'lte', field, value }
  },
  present(field) {
    return { op: 'present', field }
  },
  absent(field) {
    return { op: 'absent', field }
  },
  truthy(field) {
    return { op: 'truthy', field }
  },
  falsy(field) {
    return { op: 'falsy', field }
  },
  in(field, values) {
    return { op: 'in', field, values: cloneJson(values) }
  },
  notIn(field, values) {
    return { op: 'notIn', field, values: cloneJson(values) }
  },
  cond(condition) {
    return { op: 'cond', condition }
  },
  condEq(condition, value) {
    return { op: 'condEq', condition, value }
  },
  condIn(condition, values) {
    return { op: 'condIn', condition, values: cloneJson(values) }
  },
  fieldInCond(field, condition) {
    return { op: 'fieldInCond', field, condition }
  },
  and(...exprs) {
    return { op: 'and', exprs: cloneJson(exprs) }
  },
  or(...exprs) {
    return { op: 'or', exprs: cloneJson(exprs) }
  },
  not(expression) {
    return { op: 'not', expr: cloneJson(expression) }
  },
}
