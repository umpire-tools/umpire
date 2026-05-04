import type { Umpire, FieldDef, Snapshot, Foul } from '@umpire/core'
import { snapshotValue } from '@umpire/core/snapshot'

type UmpireFormAdapterOptions<C> = {
  conditions?: C | (() => C)
  setFieldValue?: (form: unknown, name: string, value: unknown) => void
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

type UmpireFormAdapter<F extends Record<string, FieldDef>> = {
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

  const setFieldValue =
    options?.setFieldValue ??
    ((_form: unknown, name: string, value: unknown) => {
      form.setFieldValue(name, value)
    })

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

  function getField(name: string): UmpireFormField {
    const availability = getAvailability()
    const status = (
      availability as Record<string, Partial<UmpireFormField>>
    )[name]

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
    const current: Snapshot<C> = {
      values: snapshotValue(form.state.values),
      conditions: snapshotValue(getConditions()) as C | undefined,
    }

    if (!previousSnapshot) {
      previousSnapshot = current
      return []
    }

    const fouls = engine.play(previousSnapshot, current) as Foul<F>[]
    previousSnapshot = current
    return fouls
  }

  function applyStrike(): void {
    const fouls = getFouls()
    for (const foul of fouls) {
      setFieldValue(form, foul.field, foul.suggestedValue)
    }
  }

  function refresh(values: Record<string, unknown>): void {
    previousSnapshot = {
      values: snapshotValue(values),
      conditions: snapshotValue(getConditions()) as C | undefined,
    }
  }

  return {
    getField,
    getAvailability,
    getFouls,
    applyStrike,
    refresh,
  }
}
