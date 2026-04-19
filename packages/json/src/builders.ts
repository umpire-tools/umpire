import {
  expr as baseExpr,
  type ExprBuilder,
} from '@umpire/dsl'

import {
  anyOf,
  disables,
  eitherOf,
  enabledWhen,
  fairWhen,
  requires,
  type FieldDef,
  type FieldValues,
  type NamedCheck,
  type Rule,
} from '@umpire/core'
import { cloneJson } from '@umpire/core/json'

import { createValidatorSpecFromMetadata } from './check-ops.js'
import { compileExpr, getExprFieldRefs } from './expr.js'
import type { JsonFairPredicate } from './fair-predicate.js'
import { attachJsonDef, getJsonDef } from './json-def.js'
import type { JsonExpr, JsonRequiresDependency, JsonRule } from './schema.js'

type PortableRuleOptions = {
  reason?: string
}

export type JsonExprBuilder<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = ExprBuilder<F, C> & {
  check: (field: keyof F & string, validator: NamedCheck<unknown>) => JsonExpr
}

function isPortableRuleOptions(value: unknown): value is PortableRuleOptions {
  return typeof value === 'object' && value !== null && !('op' in value)
}

function createPortableCheckExpr(field: string, validator: NamedCheck<unknown>): JsonExpr {
  const spec = createValidatorSpecFromMetadata(validator)

  if (!spec) {
    throw new Error('[@umpire/json] expr.check() requires a portable validator from @umpire/json')
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
>(expression: JsonExpr): JsonFairPredicate<FieldValues<F>, C, keyof F & string> {
  const predicate = compilePortableExpr<F, C>(expression)
  const fairPredicate = ((_: unknown, values: FieldValues<F>, conditions: C) =>
    predicate(values, conditions)) as JsonFairPredicate<FieldValues<F>, C, keyof F & string>

  fairPredicate._checkField = predicate._checkField
  fairPredicate._namedCheck = predicate._namedCheck

  return fairPredicate
}

function getRequiredJsonDef(
  rule: Rule<Record<string, FieldDef>, Record<string, unknown>>,
  caller: string,
): JsonRule {
  const jsonDef = getJsonDef<JsonRule>(rule)

  if (!jsonDef) {
    throw new Error(`[@umpire/json] ${caller} requires every inner rule to carry JSON metadata`)
  }

  return cloneJson(jsonDef)
}

export const expr: JsonExprBuilder<Record<string, FieldDef>, Record<string, unknown>> = {
  ...baseExpr,
  check: createPortableCheckExpr,
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
    throw new Error(`[@umpire/json] requiresJson("${field}") requires at least one dependency`)
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
      getRequiredJsonDef(rule as Rule<Record<string, FieldDef>, Record<string, unknown>>, 'anyOfJson()'),
    ),
  }

  return attachJsonDef(anyOf<F, C>(...rules), jsonRule)
}

export function eitherOfJson<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  groupName: string,
  branches: Record<string, Array<Rule<F, C>>>,
): Rule<F, C> {
  const jsonBranches: Record<string, JsonRule[]> = {}

  for (const [branchName, branchRules] of Object.entries(branches)) {
    jsonBranches[branchName] = branchRules.map((rule) =>
      getRequiredJsonDef(
        rule as Rule<Record<string, FieldDef>, Record<string, unknown>>,
        'eitherOfJson()',
      ),
    )
  }

  const jsonRule: Extract<JsonRule, { type: 'eitherOf' }> = {
    type: 'eitherOf',
    group: groupName,
    branches: jsonBranches,
  }

  return attachJsonDef(eitherOf<F, C>(groupName, branches), jsonRule)
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
    eitherOfJson: (
      groupName: string,
      branches: Record<string, Array<Rule<F, C>>>,
    ) => eitherOfJson<F, C>(groupName, branches),
  }
}

export type { PortableRuleOptions }
