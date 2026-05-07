import { enabledWhen, fairWhen } from '@umpire/core'
import type {
  FieldDef,
  FieldValues,
  Rule,
  RuleTraceAttachment,
} from '@umpire/core'

const READ_BRIDGES = Symbol('umpire.readBridges')

export const ReadInputType = {
  VALUES: 'values',
  CONDITIONS: 'conditions',
} as const

export type ReadInputTypeValue =
  (typeof ReadInputType)[keyof typeof ReadInputType]

type ReadContext<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
> = {
  input: Input
  read<K extends keyof Reads & string>(key: K): Reads[K]
}

type ReadResolvers<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
> = {
  [K in keyof Reads]: (context: ReadContext<Input, Reads>) => Reads[K]
}

export type PredicateReadKey<Reads extends Record<string, unknown>> = {
  [K in keyof Reads]-?: Reads[K] extends boolean ? K : never
}[keyof Reads] &
  string

export type ReadBridge<ReadId extends string = string> = {
  type: 'enabledWhen' | 'fairWhen'
  read: ReadId
  field: string
}

export type ReadTableNode<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
  ReadId extends keyof Reads & string,
> = {
  dependsOnReads: Array<keyof Reads & string>
  dependsOnFields: Array<keyof Input & string>
  id: ReadId
  value: Reads[ReadId]
}

export type ReadTableInspection<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
> = {
  bridges: ReadBridge<keyof Reads & string>[]
  graph: {
    edges: Array<
      | {
          from: keyof Reads & string
          to: keyof Reads & string
          type: 'read'
        }
      | {
          from: keyof Reads & string
          to: string
          type: 'bridge'
        }
      | {
          from: keyof Input & string
          to: keyof Reads & string
          type: 'field'
        }
    >
    nodes: Array<keyof Reads & string>
  }
  nodes: {
    [K in keyof Reads & string]: ReadTableNode<Input, Reads, K>
  }
  values: Reads
}

export type ReadTable<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
> = {
  from<K extends PredicateReadKey<Reads>>(
    key: K,
  ): (value: unknown, values: Input, conditions?: unknown) => Reads[K]
  from<K extends PredicateReadKey<Reads>, Args extends unknown[]>(
    key: K,
    selectInput: (...args: Args) => Input,
  ): (...args: Args) => Reads[K]
  inspect(input: Input): ReadTableInspection<Input, Reads>
  resolve(input: Input): Reads
  trace<
    K extends keyof Reads & string,
    C extends Record<string, unknown> = Record<string, unknown>,
  >(
    key: K,
  ): RuleTraceAttachment<Input, C>
  trace<
    K extends keyof Reads & string,
    Values extends Record<string, unknown>,
    C extends Record<string, unknown> = Record<string, unknown>,
  >(
    key: K,
    selectInput: (values: Values, conditions: C, prev?: Values) => Input,
  ): RuleTraceAttachment<Values, C>
} & {
  [K in keyof Reads]: (input: Input) => Reads[K]
}

type ReadTableInternal<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
> = ReadTable<Input, Reads> & {
  [READ_BRIDGES]: ReadBridge<keyof Reads & string>[]
}

type FairWhenReadField<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Parameters<typeof fairWhen<F, C, unknown>>[0]

type FairWhenReadOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Parameters<typeof fairWhen<F, C, unknown>>[2]

type EnabledWhenReadField<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Parameters<typeof enabledWhen<F, C>>[0]

type EnabledWhenReadOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = Parameters<typeof enabledWhen<F, C>>[2]

type FairWhenReadConfig<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  Input extends Record<string, unknown>,
> = FairWhenReadOptions<F, C> & {
  inputType?: ReadInputTypeValue
  selectInput: ReadRuleInputSelector<F, C, Input>
}

type EnabledWhenReadConfig<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  Input extends Record<string, unknown>,
> = EnabledWhenReadOptions<F, C> & {
  inputType?: ReadInputTypeValue
  selectInput: ReadRuleInputSelector<F, C, Input>
}

type FairWhenReadInputTypeConfig<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = FairWhenReadOptions<F, C> & {
  inputType: ReadInputTypeValue
}

type EnabledWhenReadInputTypeConfig<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = EnabledWhenReadOptions<F, C> & {
  inputType: ReadInputTypeValue
}

type ReadRuleInputSelector<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  Input extends Record<string, unknown>,
> = (values: FieldValues<F>, conditions: C, prev?: FieldValues<F>) => Input

function getReadBridgeStore<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
>(table: ReadTable<Input, Reads>) {
  return (table as ReadTableInternal<Input, Reads>)[READ_BRIDGES]
}

function registerReadBridge<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
>(table: ReadTable<Input, Reads>, bridge: ReadBridge<keyof Reads & string>) {
  const bridges = getReadBridgeStore(table)

  if (
    bridges.some(
      (entry) =>
        entry.type === bridge.type &&
        entry.read === bridge.read &&
        entry.field === bridge.field,
    )
  ) {
    return
  }

  bridges.push(bridge)
}

function getReadRuleFieldName(field: unknown) {
  if (typeof field === 'string') {
    return field
  }

  if (typeof field === 'object' && field !== null && '__umpfield' in field) {
    return String(field.__umpfield)
  }

  throw new Error(
    '[@umpire/reads] Named field required when using a read-backed rule',
  )
}

function mergeReadTrace<T>(trace: T, existing: T | T[] | undefined) {
  return existing
    ? [...(Array.isArray(existing) ? existing : [existing]), trace]
    : trace
}

function getDependencyProbePrimitive(property: string | symbol) {
  if (property === Symbol.toPrimitive) {
    return () => 'umpire-read-probe'
  }

  if (property === 'toString') {
    return () => 'umpire-read-probe'
  }

  if (property === 'valueOf') {
    return () => true
  }
}

function createDependencyProbe<Input extends Record<string, unknown>>(): Input {
  const terminal = new Proxy(Object.create(null), {
    get(_target, property, receiver) {
      return getDependencyProbePrimitive(property) ?? receiver
    },
  })

  return new Proxy(Object.create(null), {
    get(_target, property) {
      return getDependencyProbePrimitive(property) ?? terminal
    },
  }) as Input
}

function inferValueReadSources<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
  K extends PredicateReadKey<Reads>,
>(
  table: ReadTable<Input, Reads>,
  key: K,
  target: string,
  shouldInfer: boolean,
): string[] {
  if (!shouldInfer) {
    return []
  }

  try {
    const inspected = table.inspect(createDependencyProbe<Input>())
    const node = inspected.nodes[key]

    return [
      ...new Set(node.dependsOnFields.filter((source) => source !== target)),
    ]
  } catch {
    return []
  }
}

export function fromRead<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
  K extends PredicateReadKey<Reads>,
>(
  table: ReadTable<Input, Reads>,
  key: K,
): (value: unknown, values: Input, conditions?: unknown) => Reads[K]
export function fromRead<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
  K extends PredicateReadKey<Reads>,
  Args extends unknown[],
>(
  table: ReadTable<Input, Reads>,
  key: K,
  selectInput: (...args: Args) => Input,
): (...args: Args) => Reads[K]
export function fromRead<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
  K extends PredicateReadKey<Reads>,
>(
  table: ReadTable<Input, Reads>,
  key: K,
  selectInput?: (...args: unknown[]) => Input,
) {
  if (selectInput) {
    return (...args: unknown[]) => table[key](selectInput(...args)) as Reads[K]
  }

  return (_value: unknown, values: Input, _conditions?: unknown) =>
    table[key](values) as Reads[K]
}

export function fairWhenRead<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
  K extends PredicateReadKey<Reads> = PredicateReadKey<Reads>,
>(
  field: FairWhenReadField<F, C>,
  key: K,
  table: ReadTable<FieldValues<F>, Reads>,
  options?: FairWhenReadOptions<F, C>,
): Rule<F, C>

export function fairWhenRead<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  Input extends Record<string, unknown> = Record<string, unknown>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
  K extends PredicateReadKey<Reads> = PredicateReadKey<Reads>,
>(
  field: FairWhenReadField<F, C>,
  key: K,
  table: ReadTable<Input, Reads>,
  options: FairWhenReadInputTypeConfig<F, C>,
): Rule<F, C>

export function fairWhenRead<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  Input extends Record<string, unknown> = Record<string, unknown>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
  K extends PredicateReadKey<Reads> = PredicateReadKey<Reads>,
>(
  field: FairWhenReadField<F, C>,
  key: K,
  table: ReadTable<Input, Reads>,
  options: FairWhenReadConfig<F, C, Input>,
): Rule<F, C>
export function fairWhenRead<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  Input extends Record<string, unknown> = Record<string, unknown>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
  K extends PredicateReadKey<Reads> = PredicateReadKey<Reads>,
>(
  field: FairWhenReadField<F, C>,
  key: K,
  table: ReadTable<Input, Reads>,
  options?:
    | FairWhenReadOptions<F, C>
    | FairWhenReadInputTypeConfig<F, C>
    | FairWhenReadConfig<F, C, Input>,
): Rule<F, C> {
  const fieldName = getReadRuleFieldName(field)
  const inputType =
    (options as { inputType?: ReadInputTypeValue } | undefined)?.inputType ??
    ReadInputType.VALUES
  const selectInput =
    options && 'selectInput' in options ? options.selectInput : undefined
  const resolveInput = (
    values: FieldValues<F>,
    conditions: C,
    prev?: FieldValues<F>,
  ) => {
    if (selectInput) {
      return selectInput(values, conditions, prev)
    }

    if (inputType === ReadInputType.CONDITIONS) {
      return conditions as unknown as Input
    }

    return values as unknown as Input
  }

  registerReadBridge(table, {
    type: 'fairWhen',
    read: key,
    field: fieldName,
  })

  const trace = (
    selectInput || inputType === ReadInputType.CONDITIONS
      ? table.trace<K, FieldValues<F>, C>(key, resolveInput)
      : table.trace<K, C>(key)
  ) as RuleTraceAttachment<FieldValues<F>, C>
  const mergedTrace = mergeReadTrace(trace, options?.trace)
  const {
    inputType: _inputType,
    selectInput: _selectInput,
    ...ruleOptions
  } = (options ?? {}) as FairWhenReadOptions<F, C> & {
    inputType?: ReadInputTypeValue
    selectInput?: ReadRuleInputSelector<F, C, Input>
  }

  const predicate = ((_value: unknown, values: FieldValues<F>, conditions: C) =>
    table[key](resolveInput(values, conditions))) as Parameters<
    typeof fairWhen<F, C, unknown>
  >[1]

  const rule = fairWhen(field, predicate, {
    ...ruleOptions,
    trace: mergedTrace,
  })
  rule.sources = inferValueReadSources(
    table,
    key,
    fieldName,
    !selectInput && inputType === ReadInputType.VALUES,
  ) as Array<keyof F & string>

  return rule
}

export function enabledWhenRead<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
  K extends PredicateReadKey<Reads> = PredicateReadKey<Reads>,
>(
  field: EnabledWhenReadField<F, C>,
  key: K,
  table: ReadTable<FieldValues<F>, Reads>,
  options?: EnabledWhenReadOptions<F, C>,
): Rule<F, C>

export function enabledWhenRead<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  Input extends Record<string, unknown> = Record<string, unknown>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
  K extends PredicateReadKey<Reads> = PredicateReadKey<Reads>,
>(
  field: EnabledWhenReadField<F, C>,
  key: K,
  table: ReadTable<Input, Reads>,
  options: EnabledWhenReadInputTypeConfig<F, C>,
): Rule<F, C>

export function enabledWhenRead<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  Input extends Record<string, unknown> = Record<string, unknown>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
  K extends PredicateReadKey<Reads> = PredicateReadKey<Reads>,
>(
  field: EnabledWhenReadField<F, C>,
  key: K,
  table: ReadTable<Input, Reads>,
  options: EnabledWhenReadConfig<F, C, Input>,
): Rule<F, C>
export function enabledWhenRead<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
  Input extends Record<string, unknown> = Record<string, unknown>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
  K extends PredicateReadKey<Reads> = PredicateReadKey<Reads>,
>(
  field: EnabledWhenReadField<F, C>,
  key: K,
  table: ReadTable<Input, Reads>,
  options?:
    | EnabledWhenReadOptions<F, C>
    | EnabledWhenReadInputTypeConfig<F, C>
    | EnabledWhenReadConfig<F, C, Input>,
): Rule<F, C> {
  const fieldName = getReadRuleFieldName(field)
  const inputType =
    (options as { inputType?: ReadInputTypeValue } | undefined)?.inputType ??
    ReadInputType.VALUES
  const selectInput =
    options && 'selectInput' in options ? options.selectInput : undefined
  const resolveInput = (
    values: FieldValues<F>,
    conditions: C,
    prev?: FieldValues<F>,
  ) => {
    if (selectInput) {
      return selectInput(values, conditions, prev)
    }

    if (inputType === ReadInputType.CONDITIONS) {
      return conditions as unknown as Input
    }

    return values as unknown as Input
  }

  registerReadBridge(table, {
    type: 'enabledWhen',
    read: key,
    field: fieldName,
  })

  const trace = (
    selectInput || inputType === ReadInputType.CONDITIONS
      ? table.trace<K, FieldValues<F>, C>(key, resolveInput)
      : table.trace<K, C>(key)
  ) as RuleTraceAttachment<FieldValues<F>, C>
  const mergedTrace = mergeReadTrace(trace, options?.trace)
  const {
    inputType: _inputType,
    selectInput: _selectInput,
    ...ruleOptions
  } = (options ?? {}) as EnabledWhenReadOptions<F, C> & {
    inputType?: ReadInputTypeValue
    selectInput?: ReadRuleInputSelector<F, C, Input>
  }

  const predicate = ((
    values: FieldValues<F>,
    conditions: C,
    prev?: FieldValues<F>,
  ) => table[key](resolveInput(values, conditions, prev))) as Parameters<
    typeof enabledWhen<F, C>
  >[1]

  const rule = enabledWhen(field, predicate, {
    ...ruleOptions,
    trace: mergedTrace,
  })
  rule.sources = inferValueReadSources(
    table,
    key,
    fieldName,
    !selectInput && inputType === ReadInputType.VALUES,
  ) as Array<keyof F & string>

  return rule
}

export function createReads<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
>(resolvers: ReadResolvers<Input, Reads>): ReadTable<Input, Reads> {
  const keys = Object.keys(resolvers) as Array<keyof Reads & string>
  const bridgeStore: ReadBridge<keyof Reads & string>[] = []

  function createSession(input: Input) {
    const cache = new Map<keyof Reads & string, Reads[keyof Reads & string]>()
    const stack: Array<keyof Reads & string> = []
    const readDependencies = new Map<
      keyof Reads & string,
      Set<keyof Reads & string>
    >(keys.map((key) => [key, new Set<keyof Reads & string>()]))
    const fieldDependencies = new Map<
      keyof Reads & string,
      Set<keyof Input & string>
    >(keys.map((key) => [key, new Set<keyof Input & string>()]))

    const trackedInput = new Proxy(input, {
      get(target, property, receiver) {
        const current = stack.at(-1)

        if (current && typeof property === 'string') {
          fieldDependencies.get(current)?.add(property as keyof Input & string)
        }

        return Reflect.get(target, property, receiver)
      },
    })

    function read<K extends keyof Reads & string>(key: K): Reads[K] {
      const current = stack.at(-1)

      if (current && current !== key) {
        readDependencies.get(current)?.add(key)
      }

      if (cache.has(key)) {
        return cache.get(key) as Reads[K]
      }

      if (stack.includes(key)) {
        const cycle = [...stack, key].map(String).join(' -> ')
        throw new Error(
          `[@umpire/reads] createReads circular dependency: ${cycle}`,
        )
      }

      stack.push(key)
      const value = resolvers[key]({ input: trackedInput, read })
      cache.set(key, value)
      stack.pop()
      return value
    }

    return {
      getReadDependencies(key: keyof Reads & string) {
        return [...(readDependencies.get(key) ?? [])]
      },
      getFieldDependencies(key: keyof Reads & string) {
        return [...(fieldDependencies.get(key) ?? [])]
      },
      read,
    }
  }

  function inspectInput(input: Input): ReadTableInspection<Input, Reads> {
    const session = createSession(input)
    const values = Object.fromEntries(
      keys.map((key) => [key, session.read(key)]),
    ) as Reads

    const nodes = Object.fromEntries(
      keys.map((key) => [
        key,
        {
          id: key,
          value: values[key],
          dependsOnReads: session.getReadDependencies(key),
          dependsOnFields: session.getFieldDependencies(key),
        },
      ]),
    ) as ReadTableInspection<Input, Reads>['nodes']

    return {
      values,
      nodes,
      bridges: [...bridgeStore],
      graph: {
        nodes: [...keys],
        edges: [
          ...keys.flatMap((key) => [
            ...session.getReadDependencies(key).map((from) => ({
              from,
              to: key,
              type: 'read' as const,
            })),
            ...session.getFieldDependencies(key).map((from) => ({
              from,
              to: key,
              type: 'field' as const,
            })),
          ]),
          ...bridgeStore.map((bridge) => ({
            from: bridge.read,
            to: bridge.field,
            type: 'bridge' as const,
          })),
        ],
      },
    }
  }

  function resolveInput(input: Input): Reads {
    const session = createSession(input)

    return Object.fromEntries(
      keys.map((key) => [key, session.read(key)]),
    ) as Reads
  }

  function resolveRead<K extends keyof Reads>(key: K, input: Input): Reads[K] {
    return createSession(input).read(key as keyof Reads & string) as Reads[K]
  }

  function buildPredicate<K extends PredicateReadKey<Reads>>(
    key: K,
    selectInput?: (...args: unknown[]) => Input,
  ) {
    if (selectInput) {
      return (...args: unknown[]) => resolveRead(key, selectInput(...args))
    }

    return (_value: unknown, values: Input, _conditions?: unknown) =>
      resolveRead(key, values)
  }

  function buildTrace<
    K extends keyof Reads & string,
    C extends Record<string, unknown> = Record<string, unknown>,
  >(key: K): RuleTraceAttachment<Input, C>
  function buildTrace<
    K extends keyof Reads & string,
    Values extends Record<string, unknown>,
    C extends Record<string, unknown> = Record<string, unknown>,
  >(
    key: K,
    selectInput: (values: Values, conditions: C, prev?: Values) => Input,
  ): RuleTraceAttachment<Values, C>
  function buildTrace<
    K extends keyof Reads & string,
    Values extends Record<string, unknown>,
    C extends Record<string, unknown> = Record<string, unknown>,
  >(
    key: K,
    selectInput?: (values: Values, conditions: C, prev?: Values) => Input,
  ) {
    return {
      kind: 'read',
      id: key,
      inspect(values: Values | Input, conditions?: C, prev?: Values) {
        const input = selectInput
          ? selectInput(values as Values, conditions as C, prev)
          : (values as Input)
        const inspected = inspectInput(input)
        const node = inspected.nodes[key]

        return {
          value: node.value,
          dependencies: [
            ...node.dependsOnFields.map((id) => ({ kind: 'field', id })),
            ...node.dependsOnReads.map((id) => ({ kind: 'read', id })),
          ],
        }
      },
    }
  }

  const table = {
    from: buildPredicate,
    inspect: inspectInput,
    resolve: resolveInput,
    trace: buildTrace,
  } as ReadTable<Input, Reads>

  Object.defineProperty(table, READ_BRIDGES, {
    enumerable: false,
    value: bridgeStore,
    writable: false,
  })

  for (const key of keys) {
    table[key] = ((input: Input) => resolveRead(key, input)) as ReadTable<
      Input,
      Reads
    >[typeof key]
  }

  return table
}
