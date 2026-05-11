import {
  field,
  umpire as createUmpire,
  requires,
  disables,
  fairWhen,
  oneOf,
  type FieldBuilder,
  type FieldDef,
  type JsonPrimitive,
  type Rule,
} from '@umpire/core'
import type { Expr } from '@umpire/dsl'
import {
  buildRequiresPredicate,
  compileWhenPredicate,
  getValuePropNames,
} from './expr-helpers.js'

// ---- Internal descriptor shapes (passed up the JSX tree, never user-facing) ----

type RequiresDescriptor = {
  readonly _ump: 'requires'
  readonly dep?: string
  readonly reason?: string
  readonly eq?: JsonPrimitive
  readonly neq?: JsonPrimitive
  readonly gt?: number
  readonly gte?: number
  readonly lt?: number
  readonly lte?: number
  readonly in?: JsonPrimitive[]
  readonly notIn?: JsonPrimitive[]
  readonly truthy?: true
  readonly falsy?: true
  readonly when?: Expr
}

type DisablesDescriptor = {
  readonly _ump: 'disables'
  readonly fields: readonly string[]
  readonly reason?: string
}

type StandaloneDisablesDescriptor = {
  readonly _ump: 'standaloneDisables'
  readonly source: string
  readonly fields: readonly string[]
  readonly reason?: string
}

type FairWhenDescriptor = {
  readonly _ump: 'fairWhen'
  readonly check: (value: unknown) => boolean
  readonly reason?: string
}

type RuleDescriptor =
  | RequiresDescriptor
  | DisablesDescriptor
  | FairWhenDescriptor

type FieldDescriptor = {
  readonly _ump: 'field'
  readonly name: string
  readonly def: FieldBuilder<unknown>
  readonly ruleDescs: ReadonlyArray<RuleDescriptor>
  readonly ruleBuilders: ReadonlyArray<
    (
      fieldName: string,
      fieldNames: Set<string>,
    ) => Rule<Record<string, FieldDef>, Record<string, unknown>>[]
  >
}

type OneOfDescriptor = {
  readonly _ump: 'oneOf'
  readonly name: string
  readonly groups: Record<string, readonly string[]>
}

type UmpireChild =
  | FieldDescriptor
  | StandaloneDisablesDescriptor
  | OneOfDescriptor

// ---- Public prop types ----

export interface FieldProps {
  /** The field's key in your values object — same name you'll use in your app. */
  name: string
  /** Mark this field as required — a write check will flag it if it's empty. */
  required?: boolean
  /** Override how "empty" is detected for this field's value. */
  isEmpty?: (value: unknown) => boolean
  children?: RuleDescriptor | readonly RuleDescriptor[]
}

export interface RequiresProps {
  /**
   * The name of the field this one depends on.
   * Required when using value props (`eq`, `gte`, etc.). Omit when using `when`.
   */
  dep?: string
  reason?: string
  eq?: JsonPrimitive
  neq?: JsonPrimitive
  gt?: number
  gte?: number
  lt?: number
  lte?: number
  in?: JsonPrimitive[]
  notIn?: JsonPrimitive[]
  truthy?: true
  falsy?: true
  when?: Expr
}

export interface DisablesProps {
  /**
   * Names of the fields to disable while this field holds a value.
   * Use when filling one field makes other fields irrelevant.
   */
  fields: readonly string[]
  reason?: string
}

export interface StandaloneDisablesProps {
  /** The field that, when it holds a value, disables the listed fields. */
  source: string
  /** Names of the fields to disable while `source` holds a value. */
  fields: readonly string[]
  reason?: string
}

export interface OneOfProps {
  /** Group name passed to core's oneOf() */
  name: string
  /** Branch definitions — each key is a branch name, each value is the field names in that branch */
  groups: Record<string, readonly string[]>
}

export interface FairWhenProps {
  /** Called with the field's own value. Return false to mark the value foul. */
  check: (value: unknown) => boolean
  reason?: string
}

export interface UmpireProps {
  children?: UmpireChild | readonly UmpireChild[]
}

// ---- Components ----

export function Field({
  name,
  required: req,
  isEmpty: isEmptyFn,
  children,
}: FieldProps): FieldDescriptor {
  let def = field()
  if (req) def = def.required()
  if (isEmptyFn) def = def.isEmpty(isEmptyFn)

  const ruleDescs: readonly RuleDescriptor[] = !children
    ? []
    : Array.isArray(children)
      ? (children as readonly RuleDescriptor[])
      : [children as RuleDescriptor]

  const ruleBuilders = ruleDescs.map((desc) => {
    if (desc._ump === 'requires') {
      const rdesc = desc as RequiresDescriptor
      const valuePropKeys = getValuePropNames()
      const hasValueProps = valuePropKeys.some(
        (k) => (rdesc as Record<string, unknown>)[k] !== undefined,
      )
      const hasWhen = rdesc.when !== undefined

      if (hasWhen) {
        const when = rdesc.when
        return (target: string, fieldNames: Set<string>) => {
          const predicate = compileWhenPredicate(when, fieldNames)
          const opts = rdesc.reason ? { reason: rdesc.reason } : undefined
          return [
            requires<Record<string, FieldDef>>(
              target,
              predicate,
              ...(opts ? [opts] : []),
            ),
          ]
        }
      }

      if (hasValueProps) {
        const dep = rdesc.dep!
        const valueProps: Record<string, unknown> = {}
        for (const k of valuePropKeys) {
          const v = (rdesc as Record<string, unknown>)[k]
          if (v !== undefined) valueProps[k] = v
        }
        return (target: string, fieldNames: Set<string>) => {
          const predicate = buildRequiresPredicate(dep, valueProps, fieldNames)
          const opts = rdesc.reason ? { reason: rdesc.reason } : undefined
          return [
            requires<Record<string, FieldDef>>(target, dep),
            requires<Record<string, FieldDef>>(
              target,
              predicate,
              ...(opts ? [opts] : []),
            ),
          ]
        }
      }

      const dep = rdesc.dep!
      const reason = rdesc.reason
      return (target: string, _fieldNames: Set<string>) => {
        const opts = reason ? { reason } : undefined
        return [
          requires<Record<string, FieldDef>>(
            target,
            dep,
            ...(opts ? [opts] : []),
          ),
        ]
      }
    }
    if (desc._ump === 'disables') {
      const targets = desc.fields as string[]
      const reason = desc.reason
      return (_target: string, _fieldNames: Set<string>) => {
        const opts = reason ? { reason } : undefined
        return [disables<Record<string, FieldDef>>(name, targets, opts)]
      }
    }
    if (desc._ump === 'fairWhen') {
      const check = desc.check
      const reason = desc.reason
      return (_target: string, _fieldNames: Set<string>) => {
        const opts = reason ? { reason } : undefined
        return [
          fairWhen<Record<string, FieldDef>>(
            name,
            (value) => check(value),
            opts,
          ),
        ]
      }
    }
    throw new Error(
      `[@umpire/jsx] Unknown rule descriptor: ${(desc as { _ump: string })._ump}`,
    )
  })

  return { _ump: 'field', name, def, ruleDescs, ruleBuilders }
}

export function Requires(props: RequiresProps): RequiresDescriptor {
  return {
    _ump: 'requires',
    dep: props.dep,
    reason: props.reason,
    eq: props.eq,
    neq: props.neq,
    gt: props.gt,
    gte: props.gte,
    lt: props.lt,
    lte: props.lte,
    in: props.in,
    notIn: props.notIn,
    truthy: props.truthy,
    falsy: props.falsy,
    when: props.when,
  }
}

export function Disables({
  fields,
  reason,
}: DisablesProps): DisablesDescriptor {
  return { _ump: 'disables', fields, reason }
}

export function StandaloneDisables({
  source,
  fields,
  reason,
}: StandaloneDisablesProps): StandaloneDisablesDescriptor {
  return { _ump: 'standaloneDisables', source, fields, reason }
}

export function OneOf({ name, groups }: OneOfProps): OneOfDescriptor {
  return { _ump: 'oneOf', name, groups }
}

export function FairWhen({ check, reason }: FairWhenProps): FairWhenDescriptor {
  return { _ump: 'fairWhen', check, reason }
}

export function Umpire({ children }: UmpireProps) {
  const childDescs: readonly UmpireChild[] = !children
    ? []
    : Array.isArray(children)
      ? (children as readonly UmpireChild[])
      : [children as UmpireChild]

  // First pass: collect field names from Field descriptors
  const allFieldNames = new Set<string>()
  for (const desc of childDescs) {
    if (desc._ump === 'field') {
      allFieldNames.add(desc.name)
    } else if (desc._ump !== 'standaloneDisables' && desc._ump !== 'oneOf') {
      throw new Error(
        `[@umpire/jsx] Unknown child type in <Umpire>: ${(desc as { _ump: string })._ump}`,
      )
    }
  }

  // Validate standalone disables references
  for (const desc of childDescs) {
    if (desc._ump === 'standaloneDisables') {
      if (!allFieldNames.has(desc.source)) {
        throw new Error(
          `[@umpire/jsx] Unknown source field "${desc.source}" in <StandaloneDisables>`,
        )
      }
      for (const f of desc.fields) {
        if (!allFieldNames.has(f)) {
          throw new Error(
            `[@umpire/jsx] Unknown target field "${f}" in <StandaloneDisables>`,
          )
        }
      }
    }
  }

  // Validate oneOf references
  for (const desc of childDescs) {
    if (desc._ump === 'oneOf') {
      for (const [branchName, branchFields] of Object.entries(desc.groups)) {
        if (branchFields.length === 0) {
          throw new Error(
            `[@umpire/jsx] oneOf("${desc.name}") branch "${branchName}" must not be empty`,
          )
        }
        for (const f of branchFields) {
          if (!allFieldNames.has(f)) {
            throw new Error(
              `[@umpire/jsx] Unknown field "${f}" in oneOf("${desc.name}") branch "${branchName}"`,
            )
          }
        }
      }
    }
  }

  // Validate rule descriptors on Field children
  const valuePropKeys = getValuePropNames()
  for (const desc of childDescs) {
    if (desc._ump !== 'field') continue
    for (const rd of desc.ruleDescs) {
      if (rd._ump === 'requires') {
        const hasDep = rd.dep !== undefined
        const hasWhen = (rd as RequiresDescriptor).when !== undefined
        const hasValueProps = valuePropKeys.some(
          (k) => (rd as Record<string, unknown>)[k] !== undefined,
        )

        if (hasDep && !allFieldNames.has(rd.dep)) {
          throw new Error(`[@umpire/jsx] Unknown field "${rd.dep}" in requires`)
        }
        if (hasWhen && (hasDep || hasValueProps)) {
          throw new Error(
            `[@umpire/jsx] "when" cannot be combined with "dep" or value props on <Requires>`,
          )
        }
        if (hasValueProps && !hasDep) {
          throw new Error(
            `[@umpire/jsx] Value props require "dep" on <Requires>`,
          )
        }
        if (!hasDep && !hasWhen) {
          throw new Error(
            `[@umpire/jsx] <Requires> requires either "dep" or "when"`,
          )
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields: Record<string, any> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rules: any[] = []

  // Second pass: build fields and rules
  for (const desc of childDescs) {
    if (desc._ump === 'field') {
      fields[desc.name] = desc.def
      for (const buildRule of desc.ruleBuilders) {
        rules.push(...buildRule(desc.name, allFieldNames))
      }
    }
    if (desc._ump === 'standaloneDisables') {
      const opts = desc.reason ? { reason: desc.reason } : undefined
      rules.push(
        disables<Record<string, FieldDef>>(
          desc.source,
          desc.fields as string[],
          opts,
        ),
      )
    }
    if (desc._ump === 'oneOf') {
      rules.push(
        oneOf<Record<string, FieldDef>>(
          desc.name,
          desc.groups as Record<string, string[]>,
        ),
      )
    }
  }

  return createUmpire({ fields, rules })
}

// Re-export the JSX runtime so users can opt into the pragma without a separate import.
export { jsx, jsxs, Fragment } from './runtime.js'
