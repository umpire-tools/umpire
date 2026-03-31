import type {
  AvailabilityMap,
  FieldAvailability,
  FieldDef,
  InputValues,
  ResetRecommendation,
  Umpire,
} from '@umpire/core'

type StoreApi<S> = {
  getState(): S
  subscribe(listener: (state: S, prevState: S) => void): () => void
}

type FromStoreOptions<S, F extends Record<string, FieldDef>, C extends Record<string, unknown>> = {
  select: (state: S) => InputValues
  conditions?: (state: S) => C
}

export interface UmpireStore<F extends Record<string, FieldDef>> {
  field(name: keyof F & string): FieldAvailability
  get penalties(): ResetRecommendation<F>[]
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

  const initialState = store.getState()
  const initialValues = select(initialState)
  const initialCond = conditions ? conditions(initialState) : (undefined as unknown as C)

  let currentAvailability = ump.check(initialValues, initialCond)
  let currentPenalties: ResetRecommendation<F>[] = []
  let prevValues = initialValues
  let prevCond = initialCond

  const listeners = new Set<(availability: AvailabilityMap<F>) => void>()

  const unsubscribe = store.subscribe((state, prevState) => {
    const nextValues = select(state)
    const nextCond = conditions ? conditions(state) : (undefined as unknown as C)
    const prev = select(prevState)
    const prevConditions = conditions ? conditions(prevState) : (undefined as unknown as C)

    currentAvailability = ump.check(nextValues, nextCond, prev)
    currentPenalties = ump.flag(
      { values: prev, conditions: prevConditions },
      { values: nextValues, conditions: nextCond },
    )

    prevValues = nextValues
    prevCond = nextCond

    for (const listener of listeners) {
      listener(currentAvailability)
    }
  })

  return {
    field(name: keyof F & string): FieldAvailability {
      return currentAvailability[name]
    },

    get penalties(): ResetRecommendation<F>[] {
      return currentPenalties
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
