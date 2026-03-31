import type {
  AvailabilityMap,
  FieldAvailability,
  FieldDef,
  InputValues,
  ResetRecommendation,
  Umpire,
} from '@umpire/core'
import type { SignalProtocol } from './protocol.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ReactiveField = {
  readonly enabled: boolean
  readonly required: boolean
  readonly reason: string | null
  readonly reasons: string[]
}

export interface ReactiveUmpire<F extends Record<string, FieldDef>> {
  field(name: keyof F & string): ReactiveField
  set(name: keyof F & string, value: unknown): void
  update(partial: Partial<Record<keyof F & string, unknown>>): void
  readonly values: Record<keyof F & string, unknown>
  readonly penalties: ResetRecommendation<F>[]
  dispose(): void
}

export type ReactiveUmpOptions<F extends Record<string, FieldDef>> = {
  signals?: Partial<
    Record<keyof F & string, { get(): unknown; set(value: unknown): void }>
  >
  conditions?: Record<string, { get(): unknown }>
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function reactiveUmp<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  adapter: SignalProtocol,
  options?: ReactiveUmpOptions<F>,
): ReactiveUmpire<F> {
  const fieldNames = ump.graph().nodes as Array<keyof F & string>

  // --- 1. One writable signal per field ---
  const fieldSignals = new Map<
    string,
    { get(): unknown; set(value: unknown): void }
  >()

  const initValues = ump.init()

  for (const name of fieldNames) {
    const external = options?.signals?.[name]
    if (external) {
      fieldSignals.set(name, external)
    } else {
      fieldSignals.set(name, adapter.signal(initValues[name]))
    }
  }

  // --- 2. Conditions signals ---
  const conditionSignals = options?.conditions ?? {}

  // --- 3. Lazy proxy for fine-grained predicate tracking ---
  function createValuesProxy(): InputValues {
    return new Proxy({}, {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined
        const sig = fieldSignals.get(prop)
        return sig ? sig.get() : undefined
      },
      has(_target, prop) {
        if (typeof prop !== 'string') return false
        return fieldSignals.has(prop)
      },
      ownKeys() {
        return fieldNames as string[]
      },
      getOwnPropertyDescriptor(_target, prop) {
        if (typeof prop !== 'string' || !fieldSignals.has(prop)) return undefined
        return { configurable: true, enumerable: true, writable: true }
      },
    })
  }

  function createConditionsProxy(): C {
    return new Proxy({} as C, {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined
        const sig = conditionSignals[prop]
        return sig ? sig.get() : undefined
      },
      has(_target, prop) {
        if (typeof prop !== 'string') return false
        return prop in conditionSignals
      },
      ownKeys() {
        return Object.keys(conditionSignals)
      },
      getOwnPropertyDescriptor(_target, prop) {
        if (typeof prop !== 'string' || !(prop in conditionSignals)) return undefined
        return { configurable: true, enumerable: true, writable: true }
      },
    })
  }

  const valuesProxy = createValuesProxy()
  const conditionsProxy = createConditionsProxy()

  // --- 4. Computed availability per field ---
  // One computed that runs ump.check() — all field computeds derive from it.
  // This is more efficient than running check() per field since check()
  // evaluates the full graph in topological order.
  const availabilityComputed = adapter.computed<AvailabilityMap<F>>(() => {
    return ump.check(valuesProxy, conditionsProxy)
  })

  // Per-field computed signals for each availability property.
  const fieldComputeds = new Map<
    string,
    {
      enabled: { get(): boolean }
      required: { get(): boolean }
      reason: { get(): string | null }
      reasons: { get(): string[] }
    }
  >()

  for (const name of fieldNames) {
    fieldComputeds.set(name, {
      enabled: adapter.computed(() => availabilityComputed.get()[name].enabled),
      required: adapter.computed(() => availabilityComputed.get()[name].required),
      reason: adapter.computed(() => availabilityComputed.get()[name].reason),
      reasons: adapter.computed(() => availabilityComputed.get()[name].reasons),
    })
  }

  // --- 5. Aggregate values computed ---
  const valuesComputed = adapter.computed<Record<keyof F & string, unknown>>(
    () => {
      const result = {} as Record<keyof F & string, unknown>
      for (const name of fieldNames) {
        result[name] = fieldSignals.get(name)!.get()
      }
      return result
    },
  )

  // --- 6. Penalties tracking (requires effect) ---
  const disposeFns: Array<() => void> = []
  let penaltiesComputed: { get(): ResetRecommendation<F>[] } | null = null

  if (adapter.effect) {
    // Penalties tracking via effect + mutable snapshots.
    //
    // We maintain two mutable snapshots (plain variables, not signals):
    // - `beforeValues`/`beforeConditions`: the state BEFORE the most recent change
    // - `lastValues`/`lastConditions`: the state we saw on the last effect run
    //
    // When the effect fires (a dependency changed):
    // 1. `beforeValues` = `lastValues` (the old "current" is now "before")
    // 2. `lastValues` = actual current signal values
    // 3. Bump a version counter signal to trigger penalties recomputation
    //
    // The penalties computed reads the version counter (to track as a dependency)
    // and uses `ump.flag(before, after)` with the snapshots.

    let beforeValues: InputValues = Object.fromEntries(
      fieldNames.map((n) => [n, fieldSignals.get(n)!.get()]),
    )
    let beforeConditions: C = Object.fromEntries(
      Object.keys(conditionSignals).map((k) => [k, conditionSignals[k].get()]),
    ) as C
    let lastValues: InputValues = { ...beforeValues }
    let lastConditions: C = { ...beforeConditions } as C

    const version = adapter.signal(0)
    let isFirstRun = true

    const dispose = adapter.effect(() => {
      // Read all field signals to register as dependencies
      const currentVals: InputValues = {}
      for (const name of fieldNames) {
        currentVals[name] = fieldSignals.get(name)!.get()
      }
      const currentCond = {} as Record<string, unknown>
      for (const k of Object.keys(conditionSignals)) {
        currentCond[k] = conditionSignals[k].get()
      }

      if (isFirstRun) {
        isFirstRun = false
        lastValues = currentVals
        lastConditions = currentCond as C
        return
      }

      // Advance: what was "current" becomes "before"
      beforeValues = lastValues
      beforeConditions = lastConditions

      // Store new current
      lastValues = currentVals
      lastConditions = currentCond as C

      // Bump version to notify penalties computed
      version.set(version.get() + 1)
    })

    disposeFns.push(dispose)

    // Penalties computed: diff before vs current using ump.flag()
    penaltiesComputed = adapter.computed<ResetRecommendation<F>[]>(() => {
      // Read version to register dependency
      const v = version.get()
      if (v === 0) return []

      // Read current values through proxy for signal tracking
      return ump.flag(
        { values: beforeValues, conditions: beforeConditions },
        { values: valuesProxy, conditions: conditionsProxy },
      )
    })
  } else {
    // No effect available — warn and degrade gracefully
    console.warn(
      '[@umpire/signals] Adapter does not provide effect(). ' +
        'penalties tracking is unavailable. ' +
        'Field availability still works.',
    )
  }

  // --- Build the public API ---
  // Cache field() results so the same object is returned for the same name
  const fieldCache = new Map<string, ReactiveField>()

  return {
    field(name: keyof F & string): ReactiveField {
      let cached = fieldCache.get(name)
      if (cached) return cached

      const computeds = fieldComputeds.get(name)
      if (!computeds) {
        throw new Error(`Unknown field "${name}"`)
      }

      cached = {
        get enabled() {
          return computeds.enabled.get()
        },
        get required() {
          return computeds.required.get()
        },
        get reason() {
          return computeds.reason.get()
        },
        get reasons() {
          return computeds.reasons.get()
        },
      }
      fieldCache.set(name, cached)
      return cached
    },

    set(name: keyof F & string, value: unknown) {
      const sig = fieldSignals.get(name)
      if (!sig) throw new Error(`Unknown field "${name}"`)
      sig.set(value)
    },

    update(partial: Partial<Record<keyof F & string, unknown>>) {
      const fn = () => {
        for (const [name, value] of Object.entries(partial)) {
          const sig = fieldSignals.get(name)
          if (sig) sig.set(value)
        }
      }
      if (adapter.batch) {
        adapter.batch(fn)
      } else {
        fn()
      }
    },

    get values() {
      return valuesComputed.get()
    },

    get penalties() {
      if (!penaltiesComputed) {
        throw new Error(
          '[@umpire/signals] penalties is unavailable — adapter does not provide effect(). ' +
            'Use an adapter with effect support (e.g., alien-signals or @preact/signals-core).',
        )
      }
      return penaltiesComputed.get()
    },

    dispose() {
      for (const fn of disposeFns) {
        fn()
      }
      disposeFns.length = 0
    },
  }
}
