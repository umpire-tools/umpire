import type { AvailabilityMap, FieldDef, Foul } from '@umpire/core'

type StrikeSetter = (name: string, value: unknown) => void

export function formStrike<F extends Record<string, FieldDef>>(
  fouls: Foul<F>[],
  setFieldValue: StrikeSetter,
): void {
  for (const foul of fouls) {
    setFieldValue(foul.field, foul.suggestedValue)
  }
}

export function formStrikeDisabled<F extends Record<string, FieldDef>>(
  fouls: Foul<F>[],
  availability: AvailabilityMap<F>,
  setFieldValue: StrikeSetter,
): void {
  for (const foul of fouls) {
    if (availability[foul.field]?.enabled === false) {
      setFieldValue(foul.field, foul.suggestedValue)
    }
  }
}
