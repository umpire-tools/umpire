type ReadContext<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
> = {
  input: Input
  read<K extends keyof Reads>(key: K): Reads[K]
}

type ReadResolvers<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
> = {
  [K in keyof Reads]: (context: ReadContext<Input, Reads>) => Reads[K]
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
  graph: {
    edges: Array<
      | {
          from: keyof Reads & string
          to: keyof Reads & string
          type: 'read'
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
  inspect(input: Input): ReadTableInspection<Input, Reads>
  resolve(input: Input): Reads
} & {
  [K in keyof Reads]: (input: Input) => Reads[K]
}

export function createReadTable<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
>(
  resolvers: ReadResolvers<Input, Reads>,
): ReadTable<Input, Reads> {
  const keys = Object.keys(resolvers) as Array<keyof Reads>

  function createSession(input: Input) {
    const cache = new Map<keyof Reads, Reads[keyof Reads]>()
    const stack: Array<keyof Reads> = []
    const readDependencies = new Map<keyof Reads, Set<keyof Reads>>(
      keys.map((key) => [key, new Set<keyof Reads>()]),
    )
    const fieldDependencies = new Map<keyof Reads, Set<keyof Input & string>>(
      keys.map((key) => [key, new Set<keyof Input & string>()]),
    )

    const trackedInput = new Proxy(input, {
      get(target, property, receiver) {
        const current = stack.at(-1)

        if (current && typeof property === 'string') {
          fieldDependencies.get(current)?.add(property as keyof Input & string)
        }

        return Reflect.get(target, property, receiver)
      },
    })

    function read<K extends keyof Reads>(key: K): Reads[K] {
      const current = stack.at(-1)

      if (current && current !== key) {
        readDependencies.get(current)?.add(key)
      }

      if (cache.has(key)) {
        return cache.get(key) as Reads[K]
      }

      if (stack.includes(key)) {
        const cycle = [...stack, key].map(String).join(' -> ')
        throw new Error(`createReadTable circular dependency: ${cycle}`)
      }

      stack.push(key)
      const value = resolvers[key]({ input: trackedInput, read })
      cache.set(key, value)
      stack.pop()
      return value
    }

    return {
      getReadDependencies(key: keyof Reads) {
        return [...(readDependencies.get(key) ?? [])]
      },
      getFieldDependencies(key: keyof Reads) {
        return [...(fieldDependencies.get(key) ?? [])]
      },
      read,
    }
  }

  const table = {
    inspect(input: Input) {
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
        graph: {
          nodes: [...keys],
          edges: keys.flatMap((key) => ([
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
          ])),
        },
      }
    },

    resolve(input: Input) {
      const session = createSession(input)

      return Object.fromEntries(
        keys.map((key) => [key, session.read(key)]),
      ) as Reads
    },
  } as ReadTable<Input, Reads>

  for (const key of keys) {
    table[key] = ((input: Input) => createSession(input).read(key)) as ReadTable<Input, Reads>[typeof key]
  }

  return table
}
