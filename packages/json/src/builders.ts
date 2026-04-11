import {
  anyOf,
  disables,
  enabledWhen,
  fairWhen,
  requires,
  type FieldDef,
  type FieldValues,
  type JsonPrimitive,
  type NamedCheck,
  type NamedCheckMetadata,
  type Rule,
} from '@umpire/core'

import { createValidatorSpecFromMetadata } from './check-ops.js'
import { compileExpr, getExprFieldRefs } from './expr.js'
import { attachJsonDef, getJsonDef } from './json-def.js'
import type { JsonExpr, JsonRequiresDependency, JsonRule } from './schema.js'

type PortableRuleOptions = {
  reason?: string
}

type FairPredicate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = ((
  value: unknown,
  values: FieldValues<F>,
  conditions: C,
) => boolean) & {
  _checkField?: keyof F & string
  _namedCheck?: NamedCheckMetadata
}

export type JsonExprBuilder<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  eq: (field: keyof F & string, value: JsonPrimitive) => JsonExpr
  neq: (field: keyof F & string, value: JsonPrimitive) => JsonExpr
  gt: (field: keyof F & string, value: number) => JsonExpr
  gte: (field: keyof F & string, value: number) => JsonExpr
  lt: (field: keyof F & string, value: number) => JsonExpr
  lte: (field: keyof F & string, value: number) => JsonExpr
  present: (field: keyof F & string) => JsonExpr
  absent: (field: keyof F & string) => JsonExpr
  truthy: (field: keyof F & string) => JsonExpr
  falsy: (field: keyof F & string) => JsonExpr
  in: (field: keyof F & string, values: JsonPrimitive[]) => JsonExpr
  notIn: (field: keyof F & string, values: JsonPrimitive[]) => JsonExpr
  check: (field: keyof F & string, validator: NamedCheck<unknown>) => JsonExpr
  cond: (condition: keyof C & string) => JsonExpr
  condEq: (condition: keyof C & string, value: JsonPrimitive) => JsonExpr
  condIn: (condition: keyof C & string, values: JsonPrimitive[]) => JsonExpr
  fieldInCond: (field: keyof F & string, condition: keyof C & string) => JsonExpr
  and: (...exprs: JsonExpr[]) => JsonExpr
  or: (...exprs: JsonExpr[]) => JsonExpr
  not: (expr: JsonExpr) => JsonExpr
}

function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneJson(entry)) as T
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)]),
    ) as T
  }

  return value
}

function isPortableRuleOptions(value: unknown): value is PortableRuleOptions {
  return typeof value === 'object' && value !== null && !('op' in value)
}

function createPortableCheckExpr(field: string, validator: NamedCheck<unknown>): JsonExpr {
  const spec = createValidatorSpecFromMetadata(validator)

  if (!spec) {
    throw new Error('[umpire/json] expr.check() requires a portable validator from @umpire/json')
  }

  return {
    op: 'check',
    field,
    check: cloneJson(spec),
  }
}

function compilePortableExpr<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(expression: JsonExpr) {
  return compileExpr<F, C>(expression, {
    allowUndeclaredConditions: true,
    fieldNames: new Set(getExprFieldRefs(expression)),
  })
}

function compilePortableFairExpr<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(expression: JsonExpr): FairPredicate<F, C> {
  const predicate = compilePortableExpr<F, C>(expression)
  const fairPredicate = ((_: unknown, values: FieldValues<F>, conditions: C) =>
    predicate(values, conditions)) as FairPredicate<F, C>

  fairPredicate._checkField = predicate._checkField
  fairPredicate._namedCheck = predicate._namedCheck

  return fairPredicate
}

function getRequiredJsonDef(rule: Rule<Record<string, FieldDef>, Record<string, unknown>>): JsonRule {
  const jsonDef = getJsonDef<JsonRule>(rule)

  if (!jsonDef) {
    throw new Error('[umpire/json] anyOfJson() requires every inner rule to carry JSON metadata')
  }

  return cloneJson(jsonDef)
}

export const expr: JsonExprBuilder<Record<string, FieldDef>, Record<string, unknown>> = {
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
  check: createPortableCheckExpr,
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

export function enabledWhenExpr<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  field: keyof F & string,
  when: JsonExpr,
  options?: PortableRuleOptions,
): Rule<F, C> {
  const jsonRule: Extract<JsonRule, { type: 'enabledWhen' }> = {
    type: 'enabledWhen',
    field,
    when: cloneJson(when),
    ...(options?.reason ? { reason: options.reason } : {}),
  }

  return attachJsonDef(
    enabledWhen<F, C>(field, compilePortableExpr<F, C>(jsonRule.when), options),
    jsonRule,
  )
}

export function requiresExpr<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  field: keyof F & string,
  when: JsonExpr,
  options?: PortableRuleOptions,
): Rule<F, C> {
  const jsonRule: Extract<JsonRule, { type: 'requires'; when: JsonExpr }> = {
    type: 'requires',
    field,
    when: cloneJson(when),
    ...(options?.reason ? { reason: options.reason } : {}),
  }

  return attachJsonDef(
    options
      ? requires<F, C>(field, compilePortableExpr<F, C>(jsonRule.when), options)
      : requires<F, C>(field, compilePortableExpr<F, C>(jsonRule.when)),
    jsonRule,
  )
}

export function requiresJson<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  field: keyof F & string,
  ...dependencies: Array<JsonRequiresDependency | PortableRuleOptions>
): Rule<F, C> {
  const maybeOptions = dependencies[dependencies.length - 1]
  const options = isPortableRuleOptions(maybeOptions) ? maybeOptions : undefined
  const sources = (options ? dependencies.slice(0, -1) : dependencies) as JsonRequiresDependency[]

  if (sources.length === 0) {
    throw new Error(`[umpire/json] requiresJson("${field}") requires at least one dependency`)
  }

  const jsonRule: Extract<JsonRule, { type: 'requires' }> = sources.length === 1
    ? typeof sources[0] === 'string'
      ? {
          type: 'requires',
          field,
          dependency: sources[0],
          ...(options?.reason ? { reason: options.reason } : {}),
        }
      : {
          type: 'requires',
          field,
          when: cloneJson(sources[0]),
          ...(options?.reason ? { reason: options.reason } : {}),
        }
    : {
        type: 'requires',
        field,
        dependencies: sources.map((source) => (
          typeof source === 'string' ? source : cloneJson(source)
        )),
        ...(options?.reason ? { reason: options.reason } : {}),
      }

  const compiledDependencies = sources.map((source) => (
    typeof source === 'string' ? source : compilePortableExpr<F, C>(source)
  ))

  return attachJsonDef(
    options
      ? requires<F, C>(field, ...compiledDependencies, options)
      : requires<F, C>(field, ...compiledDependencies),
    jsonRule,
  )
}

export function disablesExpr<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  when: JsonExpr,
  targets: Array<keyof F & string>,
  options?: PortableRuleOptions,
): Rule<F, C> {
  const jsonRule: Extract<JsonRule, { type: 'disables'; when: JsonExpr }> = {
    type: 'disables',
    when: cloneJson(when),
    targets: [...targets],
    ...(options?.reason ? { reason: options.reason } : {}),
  }

  return attachJsonDef(
    disables<F, C>(compilePortableExpr<F, C>(jsonRule.when), jsonRule.targets, options),
    jsonRule,
  )
}

export function fairWhenExpr<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  field: keyof F & string,
  when: JsonExpr,
  options?: PortableRuleOptions,
): Rule<F, C> {
  const jsonRule: Extract<JsonRule, { type: 'fairWhen' }> = {
    type: 'fairWhen',
    field,
    when: cloneJson(when),
    ...(options?.reason ? { reason: options.reason } : {}),
  }

  return attachJsonDef(
    fairWhen<F, C>(field, compilePortableFairExpr<F, C>(jsonRule.when), options),
    jsonRule,
  )
}

export function anyOfJson<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ...rules: Array<Rule<F, C>>
): Rule<F, C> {
  const jsonRule: Extract<JsonRule, { type: 'anyOf' }> = {
    type: 'anyOf',
    rules: rules.map((rule) =>
      getRequiredJsonDef(rule as Rule<Record<string, FieldDef>, Record<string, unknown>>),
    ),
  }

  return attachJsonDef(anyOf<F, C>(...rules), jsonRule)
}

export function createJsonRules<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>() {
  return {
    expr: expr as JsonExprBuilder<F, C>,
    requiresJson: (
      field: keyof F & string,
      ...dependencies: Array<JsonRequiresDependency | PortableRuleOptions>
    ) => requiresJson<F, C>(field, ...dependencies),
    enabledWhenExpr: (field: keyof F & string, when: JsonExpr, options?: PortableRuleOptions) =>
      enabledWhenExpr<F, C>(field, when, options),
    requiresExpr: (field: keyof F & string, when: JsonExpr, options?: PortableRuleOptions) =>
      requiresExpr<F, C>(field, when, options),
    disablesExpr: (when: JsonExpr, targets: Array<keyof F & string>, options?: PortableRuleOptions) =>
      disablesExpr<F, C>(when, targets, options),
    fairWhenExpr: (field: keyof F & string, when: JsonExpr, options?: PortableRuleOptions) =>
      fairWhenExpr<F, C>(field, when, options),
    anyOfJson: (...rules: Array<Rule<F, C>>) => anyOfJson<F, C>(...rules),
  }
}

export type { PortableRuleOptions }
