import type {
  AvailabilityMap,
  FieldDef,
  FieldStatus,
  Foul,
  InputValues,
  Umpire,
} from '@umpire/core'

export type StoreApi<S> = {
  getState(): S
  subscribe(listener: (state: S, prevState: S) => void): () => void
}

export type FromStoreOptions<
  S,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  select: (state: S) => InputValues
  conditions?: (state: S) => C
}

export interface UmpireStore<F extends Record<string, FieldDef>> {
  field(name: keyof F & string): FieldStatus
  get fouls(): Foul<F>[]
  getAvailability(): AvailabilityMap<F>
  subscribe(listener: (availability: AvailabilityMap<F>) => void): () => void
  destroy(): void
}

export function fromStore<
  S,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  store: StoreApi<S>,
  options: FromStoreOptions<S, F, C>,
): UmpireStore<F> {
  const { select, conditions } = options
  const readConditions = (state: S): C => (
    conditions ? conditions(state) : (undefined as unknown as C)
  )

  const initialState = store.getState()
  const initialValues = select(initialState)
  const initialConditions = readConditions(initialState)

  let currentAvailability = ump.check(initialValues, initialConditions)
  let currentFouls: Foul<F>[] = []

  const listeners = new Set<(availability: AvailabilityMap<F>) => void>()

  const unsubscribe = store.subscribe((state, prevState) => {
    const nextValues = select(state)
    const nextConditions = readConditions(state)
    const prevValues = select(prevState)
    const prevConditions = readConditions(prevState)

    currentAvailability = ump.check(nextValues, nextConditions, prevValues)
    currentFouls = ump.play(
      { values: prevValues, conditions: prevConditions },
      { values: nextValues, conditions: nextConditions },
    )

    for (const listener of listeners) {
      listener(currentAvailability)
    }
  })

  return {
    field(name: keyof F & string): FieldStatus {
      return currentAvailability[name]
    },

    get fouls(): Foul<F>[] {
      return currentFouls
    },

    getAvailability(): AvailabilityMap<F> {
      return currentAvailability
    },

    subscribe(listener: (availability: AvailabilityMap<F>) => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    destroy(): void {
      unsubscribe()
      listeners.clear()
    },
  }
}
