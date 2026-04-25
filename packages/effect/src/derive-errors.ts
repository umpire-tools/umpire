import { ParseResult } from 'effect'
import type { AvailabilityMap, FieldDef } from '@umpire/core'

export type NormalizedFieldError = {
  field: string
  message: string
}

export function deriveErrors<F extends Record<string, FieldDef>>(
  availability: AvailabilityMap<F>,
  errors: NormalizedFieldError[],
): Partial<Record<keyof F & string, string>> {
  const result: Partial<Record<keyof F & string, string>> = {}

  for (const error of errors) {
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
