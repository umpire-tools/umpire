import type { Umpire, FieldDef, Snapshot, Foul } from '@umpire/core'
import { snapshotValue } from '@umpire/core/snapshot'

type UmpireFormAdapterOptions<C> = {
  conditions?: C | (() => C)
  setFieldValue?: (name: string, value: unknown) => void
}

export type UmpireFormField = {
  enabled: boolean
  available: boolean
  disabled: boolean
  required: boolean
  satisfied: boolean
  fair: boolean
  reason: string | null
  reasons: string[]
  error?: string
}

export type UmpireFormAdapter<F extends Record<string, FieldDef>> = {
  getField(name: string): UmpireFormField
  getAvailability(): Record<string, unknown>
  getFouls(): Foul<F>[]
  applyStrike(): void
  refresh(values: Record<string, unknown>): void
}

function getDefaultFieldStatus(): UmpireFormField {
  return {
    enabled: false,
    available: false,
    disabled: true,
    required: false,
    satisfied: false,
    fair: true,
    reason: null,
    reasons: [],
  }
}

export function createUmpireFormAdapter<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  form: {
    state: { values: Record<string, unknown> }
    setFieldValue(name: string, value: unknown): void
  },
  engine: Umpire<F, C>,
  options?: UmpireFormAdapterOptions<C>,
): UmpireFormAdapter<F> {
  let previousSnapshot: Snapshot<C> | null = null
  let cachedSnapshot: Snapshot<C> | null = null
  let cachedFouls: Foul<F>[] = []
  let hasCachedFouls = false

  const setFieldValue =
    options?.setFieldValue ?? ((name, value) => form.setFieldValue(name, value))

  function getConditions(): C | undefined {
    if (typeof options?.conditions === 'function') {
      return (options.conditions as () => C)()
    }
    return options?.conditions
  }

  function getAvailability(): Record<string, unknown> {
    const values = form.state.values
    const conditions = getConditions()
    return engine.check(values, conditions)
  }

  function getCurrentSnapshot(): Snapshot<C> {
    return {
      values: snapshotValue(form.state.values),
      conditions: snapshotValue(getConditions()) as C | undefined,
    }
  }

  function snapshotsEqual(a: Snapshot<C>, b: Snapshot<C>): boolean {
    return (
      valuesEqual(a.values, b.values) &&
      valuesEqual(a.conditions, b.conditions)
    )
  }

  function valuesEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true
    if (
      a === null ||
      b === null ||
      typeof a !== 'object' ||
      typeof b !== 'object'
    ) {
      return false
    }
    if (a instanceof Date || b instanceof Date) {
      return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      return (
        Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((entry, index) => valuesEqual(entry, b[index]))
      )
    }
    if (a instanceof Map || b instanceof Map) {
      if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) {
        return false
      }
      for (const [key, value] of a) {
        if (!b.has(key) || !valuesEqual(value, b.get(key))) return false
      }
      return true
    }
    if (a instanceof Set || b instanceof Set) {
      if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) {
        return false
      }
      for (const value of a) {
        if (!b.has(value)) return false
      }
      return true
    }

    const aEntries = Object.entries(a)
    const bRecord = b as Record<string, unknown>
    return (
      aEntries.length === Object.keys(b).length &&
      aEntries.every(([key, value]) => valuesEqual(value, bRecord[key]))
    )
  }

  function advanceFouls(): Foul<F>[] {
    const current = getCurrentSnapshot()

    if (!previousSnapshot) {
      previousSnapshot = current
      cachedSnapshot = current
      cachedFouls = []
      hasCachedFouls = true
      return cachedFouls
    }

    if (
      hasCachedFouls &&
      cachedSnapshot &&
      snapshotsEqual(cachedSnapshot, current)
    ) {
      return cachedFouls
    }

    cachedFouls = engine.play(previousSnapshot, current) as Foul<F>[]
    previousSnapshot = current
    cachedSnapshot = current
    hasCachedFouls = true
    return cachedFouls
  }

  function getField(name: string): UmpireFormField {
    const availability = getAvailability()
    const status = (availability as Record<string, Partial<UmpireFormField>>)[
      name
    ]

    if (!status) {
      return getDefaultFieldStatus()
    }

    return {
      enabled: status.enabled ?? false,
      available: status.enabled ?? false,
      disabled: !(status.enabled ?? false),
      required: status.required ?? false,
      satisfied: status.satisfied ?? false,
      fair: status.fair ?? true,
      reason: status.reason ?? null,
      reasons: status.reasons ?? [],
      error: status.error,
    }
  }

  function getFouls(): Foul<F>[] {
    return advanceFouls()
  }

  function applyStrike(): void {
    const fouls = advanceFouls()
    for (const foul of fouls) {
      setFieldValue(foul.field, foul.suggestedValue)
    }
    hasCachedFouls = false
  }

  function refresh(values: Record<string, unknown>): void {
    previousSnapshot = {
      values: snapshotValue(values),
      conditions: snapshotValue(getConditions()) as C | undefined,
    }
    cachedSnapshot = previousSnapshot
    cachedFouls = []
    hasCachedFouls = true
  }

  return {
    getField,
    getAvailability,
    getFouls,
    applyStrike,
    refresh,
  }
}
