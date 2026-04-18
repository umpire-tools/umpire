import type { FieldDef, FieldValues, Foul } from './types.js'

export function strike<F extends Record<string, FieldDef>>(
  values: FieldValues<F>,
  fouls: readonly Foul<F>[],
): FieldValues<F> {
  if (fouls.length === 0) {
    return values
  }

  let next: FieldValues<F> | undefined

  for (const foul of fouls) {
    const suggestedValue = foul.suggestedValue as FieldValues<F>[keyof F & string]

    if (Object.is(values[foul.field], suggestedValue)) {
      continue
    }

    if (!next) {
      next = { ...values }
    }

    next[foul.field] = suggestedValue
  }

  return next ?? values
}
