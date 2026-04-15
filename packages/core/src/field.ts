import type { FieldDef, FieldValues, RuleTraceAttachment } from './types.js'

const FIELD_BUILDER = Symbol('umpire.fieldBuilder')
const FIELD_STATE = Symbol('umpire.fieldState')

type ReasonOption<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = string | ((values: FieldValues<F>, conditions: C) => string)

type RuleOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  reason?: ReasonOption<F, C>
  trace?: RuleTraceAttachment<FieldValues<F>, C> | RuleTraceAttachment<FieldValues<F>, C>[]
}

type Predicate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = (values: FieldValues<F>, conditions: C) => boolean

type FairPredicate<
  V,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = (value: NonNullable<V>, values: FieldValues<F>, conditions: C) => boolean

type FieldSelector<
  F extends Record<string, FieldDef>,
  V = unknown,
> = (keyof F & string) | { readonly __umpfield: keyof F & string } | { readonly __umpfield: string }

export type AttachedFieldRule =
  | {
      kind: 'enabledWhen'
      predicate: Predicate<Record<string, FieldDef>, Record<string, unknown>>
      options?: RuleOptions<Record<string, FieldDef>, Record<string, unknown>>
    }
  | {
      kind: 'fairWhen'
      predicate: FairPredicate<unknown, Record<string, FieldDef>, Record<string, unknown>>
      options?: RuleOptions<Record<string, FieldDef>, Record<string, unknown>>
    }
  | {
      kind: 'requires'
      dependency: string
      options?: RuleOptions<Record<string, FieldDef>, Record<string, unknown>>
    }

type AttachedEnabledWhen = Extract<AttachedFieldRule, { kind: 'enabledWhen' }>
type AttachedFairWhen = Extract<AttachedFieldRule, { kind: 'fairWhen' }>
type AttachedRequires = Extract<AttachedFieldRule, { kind: 'requires' }>

type FieldBuilderState<V> = {
  definition: FieldDef<V>
  name?: string
  rules: AttachedFieldRule[]
}

export interface BaseFieldBuilder<V = unknown> {
  required(): this
  default(value: V): this
  isEmpty(fn: (value: V | null | undefined) => boolean): this
  fairWhen<
    F extends Record<string, FieldDef>,
    C extends Record<string, unknown> = Record<string, unknown>,
  >(
    predicate: FairPredicate<V, F, C>,
    options?: RuleOptions<F, C>,
  ): this
  enabledWhen<
    F extends Record<string, FieldDef>,
    C extends Record<string, unknown> = Record<string, unknown>,
  >(
    predicate: Predicate<F, C>,
    options?: RuleOptions<F, C>,
  ): this
  requires<
    F extends Record<string, FieldDef>,
    C extends Record<string, unknown> = Record<string, unknown>,
  >(
    dependency: FieldSelector<F>,
    options?: RuleOptions<F, C>,
  ): this
}

export type FieldBuilder<V = unknown> = BaseFieldBuilder<V> & {
  readonly [FIELD_BUILDER]: true
  readonly [FIELD_STATE]: FieldBuilderState<V>
}

export type FieldRef<V = unknown, Name extends string = string> = FieldBuilder<V> & {
  readonly __umpfield: Name
}

export type FieldInput<V = unknown> = FieldDef<V> | FieldBuilder<V>

export type NormalizeField<T> =
  T extends FieldBuilder<infer V> ? FieldDef<V>
  : T extends FieldDef<infer V> ? FieldDef<V>
  : FieldDef

export type NormalizeFields<F extends Record<string, FieldInput>> = {
  [K in keyof F]: NormalizeField<F[K]>
}

function pushRule<V>(builder: FieldBuilder<V>, rule: AttachedFieldRule): FieldBuilder<V> {
  builder[FIELD_STATE].rules.push(rule)
  return builder
}

function createFieldBuilder<V>(name?: string): FieldBuilder<V> {
  const state: FieldBuilderState<V> = {
    definition: {},
    name,
    rules: [],
  }

  const builder = {
    required() {
      state.definition.required = true
      return this
    },
    default(value: V) {
      state.definition.default = value
      return this
    },
    isEmpty(fn: (value: V | null | undefined) => boolean) {
      state.definition.isEmpty = fn
      return this
    },
    fairWhen<
      F extends Record<string, FieldDef>,
      C extends Record<string, unknown> = Record<string, unknown>,
    >(
      predicate: FairPredicate<V, F, C>,
      options?: RuleOptions<F, C>,
    ) {
      return pushRule(this, {
        kind: 'fairWhen',
        predicate: predicate as AttachedFairWhen['predicate'],
        options: options as AttachedFairWhen['options'],
      })
    },
    enabledWhen<
      F extends Record<string, FieldDef>,
      C extends Record<string, unknown> = Record<string, unknown>,
    >(
      predicate: Predicate<F, C>,
      options?: RuleOptions<F, C>,
    ) {
      return pushRule(this, {
        kind: 'enabledWhen',
        predicate: predicate as AttachedEnabledWhen['predicate'],
        options: options as AttachedEnabledWhen['options'],
      })
    },
    requires<
      F extends Record<string, FieldDef>,
      C extends Record<string, unknown> = Record<string, unknown>,
    >(
      dependency: FieldSelector<F>,
      options?: RuleOptions<F, C>,
    ) {
      return pushRule(this, {
        kind: 'requires',
        dependency: getFieldNameOrThrow(dependency),
        options: options as AttachedRequires['options'],
      })
    },
    [FIELD_BUILDER]: true,
    [FIELD_STATE]: state,
  } as FieldBuilder<V>

  if (name) {
    Object.defineProperty(builder, '__umpfield', {
      configurable: false,
      enumerable: false,
      value: name,
      writable: false,
    })
  }

  return builder
}

export function isFieldBuilder(value: unknown): value is FieldBuilder {
  return typeof value === 'object' && value !== null && FIELD_BUILDER in value
}

export function getFieldBuilderName(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('__umpfield' in value)) {
    return undefined
  }

  const name = (value as { __umpfield?: unknown }).__umpfield
  return typeof name === 'string' ? name : undefined
}

export function getFieldNameOrThrow<
  F extends Record<string, FieldDef>,
  V,
>(
  field: FieldSelector<F, V>,
): keyof F & string {
  if (typeof field === 'string') {
    return field
  }

  const name = getFieldBuilderName(field)
  if (!name) {
    throw new Error('[@umpire/core] Named field builder required when passing a field() value to a rule')
  }

  return name as keyof F & string
}

export function getFieldBuilderDef<V>(builder: FieldBuilder<V>): FieldDef<V> {
  return { ...builder[FIELD_STATE].definition }
}

export function getFieldBuilderRules(builder: FieldBuilder): AttachedFieldRule[] {
  return [...builder[FIELD_STATE].rules]
}

export function field<V = unknown>(): FieldBuilder<V>
export function field<V = unknown, Name extends string = string>(name: Name): FieldRef<V, Name>
export function field<V = unknown>(name?: string): FieldBuilder<V> {
  return createFieldBuilder(name)
}
