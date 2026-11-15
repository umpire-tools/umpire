import type { FieldDef, JsonPrimitive } from '@umpire/core'

export type Expr =
  | { op: 'eq'; field: string; value: JsonPrimitive }
  | { op: 'neq'; field: string; value: JsonPrimitive }
  | { op: 'gt'; field: string; value: number }
  | { op: 'gte'; field: string; value: number }
  | { op: 'lt'; field: string; value: number }
  | { op: 'lte'; field: string; value: number }
  | { op: 'present'; field: string }
  | { op: 'absent'; field: string }
  | { op: 'truthy'; field: string }
  | { op: 'falsy'; field: string }
  | { op: 'in'; field: string; values: JsonPrimitive[] }
  | { op: 'notIn'; field: string; values: JsonPrimitive[] }
  | { op: 'contains'; field: string; value: JsonPrimitive }
  | { op: 'cond'; condition: string }
  | { op: 'condEq'; condition: string; value: JsonPrimitive }
  | { op: 'condIn'; condition: string; values: JsonPrimitive[] }
  | { op: 'fieldInCond'; field: string; condition: string }
  | { op: 'and'; exprs: Expr[] }
  | { op: 'or'; exprs: Expr[] }
  | { op: 'not'; expr: Expr }

export type ExprBuilder<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  eq: (field: keyof F & string, value: JsonPrimitive) => Expr
  neq: (field: keyof F & string, value: JsonPrimitive) => Expr
  gt: (field: keyof F & string, value: number) => Expr
  gte: (field: keyof F & string, value: number) => Expr
  lt: (field: keyof F & string, value: number) => Expr
  lte: (field: keyof F & string, value: number) => Expr
  present: (field: keyof F & string) => Expr
  absent: (field: keyof F & string) => Expr
  truthy: (field: keyof F & string) => Expr
  falsy: (field: keyof F & string) => Expr
  in: (field: keyof F & string, values: JsonPrimitive[]) => Expr
  notIn: (field: keyof F & string, values: JsonPrimitive[]) => Expr
  contains: (field: keyof F & string, value: JsonPrimitive) => Expr
  cond: (condition: keyof C & string) => Expr
  condEq: (condition: keyof C & string, value: JsonPrimitive) => Expr
  condIn: (condition: keyof C & string, values: JsonPrimitive[]) => Expr
  fieldInCond: (field: keyof F & string, condition: keyof C & string) => Expr
  and: (...exprs: Expr[]) => Expr
  or: (...exprs: Expr[]) => Expr
  not: (expr: Expr) => Expr
}
