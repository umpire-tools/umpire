import type { AvailabilityMap, FieldDef, Foul } from '@umpire/core'

export function formatUmpireDebugValue<
  F extends Record<string, FieldDef>,
>(value: {
  check: AvailabilityMap<F>
  fouls: Foul<F>[]
}) {
  const { check, fouls } = value

  return {
    enabled: Object.entries(check)
      .filter(([, availability]) => availability.enabled)
      .map(([field]) => field),
    disabled: Object.entries(check)
      .filter(([, availability]) => !availability.enabled)
      .map(([field]) => field),
    fouls: fouls.map((foul) => foul.field),
  }
}
