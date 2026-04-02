import type { AvailabilityMap, FieldDef } from '@umpire/core'

export type NormalizedFieldError = {
  field: string
  message: string
}

type ZodIssueLike = {
  path: readonly (string | number)[]
  message: string
}

type ZodErrorLike = {
  issues: readonly ZodIssueLike[]
}

export function activeErrors<F extends Record<string, FieldDef>>(
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

export function zodErrors(error: ZodErrorLike): NormalizedFieldError[] {
  return error.issues.map((issue) => ({
    field: String(issue.path[0] ?? ''),
    message: issue.message,
  }))
}
