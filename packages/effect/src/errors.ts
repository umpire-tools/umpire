import { Data } from 'effect'
import type { NormalizedFieldError } from './derive-errors.js'

export class UmpireValidationError extends Data.TaggedError(
  'UmpireValidationError',
)<{
  readonly errors: Record<string, string | undefined>
  readonly normalizedErrors: NormalizedFieldError[]
}> {}
