import {
  field,
  umpire as createUmpire,
  requires,
  disables,
  type FieldBuilder,
  type FieldDef,
  type Rule,
} from '@umpire/core'

// ---- Internal descriptor shapes (passed up the JSX tree, never user-facing) ----

type RequiresDescriptor = {
  readonly _ump: 'requires'
  readonly dep: string
}

type DisablesDescriptor = {
  readonly _ump: 'disables'
  readonly fields: readonly string[]
}

type RuleDescriptor = RequiresDescriptor | DisablesDescriptor

type FieldDescriptor = {
  readonly _ump: 'field'
  readonly name: string
  readonly def: FieldBuilder<unknown>
  readonly ruleBuilders: ReadonlyArray<
    (
      fieldName: string,
    ) => Rule<Record<string, FieldDef>, Record<string, unknown>>
  >
}

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
   * The parent `<Field>` stays disabled until `dep` is filled in.
   */
  dep: string
}

export interface DisablesProps {
  /**
   * Names of the fields to disable while this field holds a value.
   * Use when filling one field makes other fields irrelevant.
   */
  fields: readonly string[]
}

export interface UmpireProps {
  children?: FieldDescriptor | readonly FieldDescriptor[]
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
      const dep = desc.dep
      return (target: string) => requires<Record<string, FieldDef>>(target, dep)
    }
    if (desc._ump === 'disables') {
      const targets = desc.fields as string[]
      return (_target: string) =>
        disables<Record<string, FieldDef>>(name, targets)
    }
    throw new Error(
      `[@umpire/jsx] Unknown rule descriptor: ${(desc as { _ump: string })._ump}`,
    )
  })

  return { _ump: 'field', name, def, ruleBuilders }
}

export function Requires({ dep }: RequiresProps): RequiresDescriptor {
  return { _ump: 'requires', dep }
}

export function Disables({ fields }: DisablesProps): DisablesDescriptor {
  return { _ump: 'disables', fields }
}

export function Umpire({ children }: UmpireProps) {
  const fieldDescs: readonly FieldDescriptor[] = !children
    ? []
    : Array.isArray(children)
      ? (children as readonly FieldDescriptor[])
      : [children as FieldDescriptor]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields: Record<string, any> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rules: any[] = []

  for (const desc of fieldDescs) {
    if (desc._ump !== 'field') {
      throw new Error(`[@umpire/jsx] <Umpire> only accepts <Field> children`)
    }
    fields[desc.name] = desc.def
    for (const buildRule of desc.ruleBuilders) {
      rules.push(buildRule(desc.name))
    }
  }

  return createUmpire({ fields, rules })
}

// Re-export the JSX runtime so users can opt into the pragma without a separate import.
export { jsx, jsxs, Fragment } from './runtime.js'
