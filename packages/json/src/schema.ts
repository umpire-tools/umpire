import type { JsonPrimitive } from '@umpire/core'

export type JsonConditionType = 'boolean' | 'string' | 'number' | 'string[]' | 'number[]'

export interface JsonConditionDef {
  type: JsonConditionType
  description?: string
}

export type JsonIsEmptyStrategy = 'string' | 'number' | 'boolean' | 'array' | 'present'

export interface JsonFieldDef {
  required?: boolean
  default?: JsonPrimitive
  isEmpty?: JsonIsEmptyStrategy
}

export type JsonExpr =
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
  | { op: 'cond'; condition: string }
  | { op: 'condEq'; condition: string; value: JsonPrimitive }
  | { op: 'condIn'; condition: string; values: JsonPrimitive[] }
  | { op: 'fieldInCond'; field: string; condition: string }
  | { op: 'and'; exprs: JsonExpr[] }
  | { op: 'or'; exprs: JsonExpr[] }
  | { op: 'not'; expr: JsonExpr }

export type JsonCheckOp =
  | 'email'
  | 'url'
  | 'matches'
  | 'minLength'
  | 'maxLength'
  | 'min'
  | 'max'
  | 'range'
  | 'integer'

export type JsonCheckRule =
  | { type: 'check'; field: string; op: 'email' | 'url' | 'integer'; reason?: string }
  | { type: 'check'; field: string; op: 'matches'; pattern: string; reason?: string }
  | { type: 'check'; field: string; op: 'minLength' | 'maxLength' | 'min' | 'max'; value: number; reason?: string }
  | { type: 'check'; field: string; op: 'range'; min: number; max: number; reason?: string }

export type JsonRule =
  | { type: 'requires'; field: string; dependency: string; reason?: string }
  | { type: 'requires'; field: string; when: JsonExpr; reason?: string }
  | { type: 'enabledWhen'; field: string; when: JsonExpr; reason?: string }
  | { type: 'disables'; source: string; targets: string[]; reason?: string }
  | { type: 'disables'; when: JsonExpr; targets: string[]; reason?: string }
  | { type: 'oneOf'; group: string; branches: Record<string, string[]> }
  | { type: 'fairWhen'; field: string; when: JsonExpr; reason?: string }
  | { type: 'anyOf'; rules: JsonRule[] }
  | JsonCheckRule

export interface ExcludedRule {
  type: string
  field?: string
  description: string
  signature?: string
}

export interface UmpireJsonSchema {
  version: 1
  conditions?: Record<string, JsonConditionDef>
  fields: Record<string, JsonFieldDef>
  rules: JsonRule[]
  excluded?: ExcludedRule[]
}
