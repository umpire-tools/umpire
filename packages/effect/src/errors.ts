import { Data } from 'effect'
import type { NormalizedFieldError } from './derive-errors.js'

export class UmpireValidationError extends Data.TaggedError(
  'UmpireValidationError',
)<{
  readonly errors: Record<string, string | undefined>
  readonly message: string
  readonly normalizedErrors: NormalizedFieldError[]
}> {
  constructor(args: {
    readonly errors: Record<string, string | undefined>
    readonly normalizedErrors: NormalizedFieldError[]
  }) {
    const fields = Object.entries(args.errors).reduce<string[]>(
      (acc, [field, message]) => {
        if (message !== undefined) {
          acc.push(field)
        }

        return acc
      },
      [],
    )
    super({
      ...args,
      message:
        fields.length > 0
          ? `Validation failed: ${fields.join(', ')}`
          : 'Validation failed',
    })
  }
}
