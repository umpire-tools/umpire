import { ParseResult } from 'effect'
import type { AvailabilityMap, FieldDef } from '@umpire/core'

export type NormalizedFieldError = {
  field: string
  message: string
}

export const ROOT_ERROR_FIELD = '_root'

export type DerivedErrorMap<F extends Record<string, FieldDef>> = Partial<
  Record<(keyof F & string) | typeof ROOT_ERROR_FIELD, string>
>

export function deriveErrors<F extends Record<string, FieldDef>>(
  availability: AvailabilityMap<F>,
  errors: NormalizedFieldError[],
): DerivedErrorMap<F> {
  const result: DerivedErrorMap<F> = {}

  for (const error of errors) {
    if (error.field === '') {
      result[ROOT_ERROR_FIELD] ??= error.message
      continue
    }

    const field = error.field as keyof F & string
    if (availability[field]?.enabled && result[field] === undefined) {
      result[field] = error.message
    }
  }

  return result
}

export function effectErrors(
  parseError: ParseResult.ParseError,
): NormalizedFieldError[] {
  const formatted = ParseResult.ArrayFormatter.formatErrorSync(parseError)
  return formatted.map((item) => ({
    field: String(item.path[0] ?? ''),
    message: item.message,
  }))
}
