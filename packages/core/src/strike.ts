import type { FieldDef, FieldValues, Foul } from './types.js'

export function strike<F extends Record<string, FieldDef>>(
  values: FieldValues<F>,
  fouls: readonly Foul<F>[],
): FieldValues<F> {
  // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent mutant — `next ?? values` handles empty fouls identically
  if (fouls.length === 0) {
    return values
  }

  let next: FieldValues<F> | undefined

  for (const foul of fouls) {
    if (Object.is(values[foul.field], foul.suggestedValue)) {
      continue
    }

    if (!next) {
      next = { ...values }
    }

    next[foul.field] = foul.suggestedValue
  }

  return next ?? values
}
