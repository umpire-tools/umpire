import type {
  AvailabilityMap,
  FieldDef,
  FieldValues,
  InputValues,
  FieldStatus,
  Foul,
  Umpire,
} from '@umpire/core'
import { snapshotValue } from '@umpire/core/snapshot'
import type { SignalProtocol } from './protocol.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ReactiveField = {
  readonly [K in keyof FieldStatus]: FieldStatus[K]
}

type ReactiveValues<F extends Record<string, FieldDef>> = {
  [K in keyof F & string]: FieldValues<F>[K]
}

type ReactiveSignal<T> = {
  get(): T
  set(value: T): void
}

type ReactiveFieldSignals<F extends Record<string, FieldDef>> = Partial<{
  [K in keyof F & string]: ReactiveSignal<FieldValues<F>[K]>
}>

type ReactiveConditionSignals<C extends Record<string, unknown>> = Partial<{
  [K in keyof C & string]: { get(): C[K] }
}>

export interface ReactiveUmpire<F extends Record<string, FieldDef>> {
  field(name: keyof F & string): ReactiveField
  foul(name: keyof F & string): Foul<F> | undefined
  set<K extends keyof F & string>(name: K, value: FieldValues<F>[K]): void
  update(partial: FieldValues<F>): void
  readonly values: ReactiveValues<F>
  readonly fouls: Foul<F>[]
  dispose(): void
}

export type ReactiveUmpOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> = {
  signals?: ReactiveFieldSignals<F>
  conditions?: ReactiveConditionSignals<C>
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
  options?: ReactiveUmpOptions<F, C>,
): ReactiveUmpire<F> {
  const fieldNames = ump.graph().nodes as Array<keyof F & string>

  // --- 1. One writable signal per field ---
  const fieldSignals = new Map<
    keyof F & string,
    ReactiveSignal<FieldValues<F>[keyof F & string]>
  >()

  const initValues = ump.init()

  for (const name of fieldNames) {
    const external = options?.signals?.[name]
    if (external) {
      fieldSignals.set(name, external as ReactiveSignal<FieldValues<F>[typeof name]>)
    } else {
      fieldSignals.set(
        name,
        adapter.signal(initValues[name]) as ReactiveSignal<FieldValues<F>[typeof name]>,
      )
    }
  }

  // --- 2. Conditions signals ---
  const conditionSignals: ReactiveConditionSignals<C> = options?.conditions ?? {}

  // --- 3. Lazy proxy for fine-grained predicate tracking ---
  function createSignalMapProxy<T extends object>(
    keys: () => string[],
    has: (key: string) => boolean,
    get: (key: string) => unknown,
  ): T {
    return new Proxy({} as T, {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined
        return get(prop)
      },
      has(_target, prop) {
        if (typeof prop !== 'string') return false
        return has(prop)
      },
      ownKeys() {
        return keys()
      },
      getOwnPropertyDescriptor(_target, prop) {
        if (typeof prop !== 'string' || !has(prop)) return undefined
        return { configurable: true, enumerable: true, writable: true }
      },
    })
  }

  function createValuesProxy(): InputValues {
    return createSignalMapProxy<InputValues>(
      () => fieldNames as string[],
      (key) => fieldSignals.has(key),
      (key) => fieldSignals.get(key)?.get(),
    )
  }

  function createConditionsProxy(): C {
    return createSignalMapProxy<C>(
      () => Object.keys(conditionSignals),
      (key) => key in conditionSignals,
      (key) => conditionSignals[key as keyof C & string]?.get(),
    )
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
      satisfied: { get(): boolean }
      fair: { get(): boolean }
      required: { get(): boolean }
      reason: { get(): string | null }
      reasons: { get(): string[] }
    }
  >()

  for (const name of fieldNames) {
    fieldComputeds.set(name, {
      enabled: adapter.computed(() => availabilityComputed.get()[name].enabled),
      satisfied: adapter.computed(() => availabilityComputed.get()[name].satisfied),
      fair: adapter.computed(() => availabilityComputed.get()[name].fair),
      required: adapter.computed(() => availabilityComputed.get()[name].required),
      reason: adapter.computed(() => availabilityComputed.get()[name].reason),
      reasons: adapter.computed(() => availabilityComputed.get()[name].reasons),
    })
  }

  // --- 5. Aggregate values computed ---
  const valuesComputed = adapter.computed<ReactiveValues<F>>(
    () => {
      const result = {} as ReactiveValues<F>
      for (const name of fieldNames) {
        result[name] = fieldSignals.get(name)!.get() as ReactiveValues<F>[typeof name]
      }
      return result
    },
  )

  // --- 6. Fouls tracking (requires effect) ---
  const disposeFns: Array<() => void> = []
  let foulsComputed: { get(): Foul<F>[] } | null = null

  if (adapter.effect) {
    // Fouls tracking via effect + mutable snapshots.
    //
    // We maintain two mutable snapshots (plain variables, not signals):
    // - `beforeValues`/`beforeConditions`: the state BEFORE the most recent change
    // - `lastValues`/`lastConditions`: the state we saw on the last effect run
    //
    // When the effect fires (a dependency changed):
    // 1. `beforeValues` = `lastValues` (the old "current" is now "before")
    // 2. `lastValues` = actual current signal values
    //
    // The fouls computed reads current values through the proxy (which tracks
    // signal dependencies), so it recomputes whenever field/condition signals
    // change — no version counter needed.

    function readSnapshotValues() {
      return snapshotValue(Object.fromEntries(
        fieldNames.map((name) => [name, fieldSignals.get(name)!.get()]),
      ) as InputValues)
    }

    function readSnapshotConditions() {
      return snapshotValue(Object.fromEntries(
        Object.keys(conditionSignals).map((name) => [
          name,
          conditionSignals[name as keyof C & string]!.get(),
        ]),
      ) as C)
    }

    let beforeValues: InputValues = readSnapshotValues()
    let beforeConditions: C = readSnapshotConditions()
    let lastValues: InputValues = snapshotValue(beforeValues)
    let lastConditions: C = snapshotValue(beforeConditions)

    let isFirstRun = true

    const dispose = adapter.effect(() => {
      // Read all field signals to register as dependencies
      const currentVals = readSnapshotValues()
      const currentCond = readSnapshotConditions()

      if (isFirstRun) {
        isFirstRun = false
        lastValues = currentVals
        lastConditions = currentCond
        return
      }

      // Advance: what was "current" becomes "before"
      beforeValues = lastValues
      beforeConditions = lastConditions

      // Store new current
      lastValues = currentVals
      lastConditions = currentCond
    })

    disposeFns.push(dispose)

    // Fouls computed: diff before vs current using ump.play()
    // Reads current values through the proxy, which tracks field signal
    // dependencies — so this recomputes whenever any field or condition changes.
    foulsComputed = adapter.computed<Foul<F>[]>(() => {
      return ump.play(
        { values: beforeValues, conditions: beforeConditions },
        { values: valuesProxy, conditions: conditionsProxy },
      )
    })
  } else {
    // No effect available — warn and degrade gracefully
    console.warn(
      '[@umpire/signals] Adapter does not provide effect(). ' +
        'fouls tracking is unavailable. ' +
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
        throw new Error(`[@umpire/signals] Unknown field "${name}"`)
      }

      cached = {
        get enabled() {
          return computeds.enabled.get()
        },
        get satisfied() {
          return computeds.satisfied.get()
        },
        get fair() {
          return computeds.fair.get()
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

    set<K extends keyof F & string>(name: K, value: FieldValues<F>[K]) {
      const sig = fieldSignals.get(name)
      if (!sig) throw new Error(`[@umpire/signals] Unknown field "${name}"`)
      sig.set(value)
    },

    update(partial: FieldValues<F>) {
      const fn = () => {
        for (const [name, value] of Object.entries(partial)) {
          const sig = fieldSignals.get(name as keyof F & string)
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

    foul(name: keyof F & string): Foul<F> | undefined {
      if (!foulsComputed) {
        throw new Error(
          '[@umpire/signals] foul() is unavailable — adapter does not provide effect(). ' +
            'Use an adapter with effect support (e.g., alien-signals or @preact/signals-core).',
        )
      }
      return foulsComputed.get().find((f) => f.field === name)
    },

    get fouls() {
      if (!foulsComputed) {
        throw new Error(
          '[@umpire/signals] fouls is unavailable — adapter does not provide effect(). ' +
            'Use an adapter with effect support (e.g., alien-signals or @preact/signals-core).',
        )
      }
      return foulsComputed.get()
    },

    dispose() {
      for (const fn of disposeFns) {
        fn()
      }
      disposeFns.length = 0
    },
  }
}
