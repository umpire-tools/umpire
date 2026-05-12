import { shouldWarnInDev, isNamedCheck } from '@umpire/core/internal'
import type {
  AvailabilityMap,
  FieldDef,
  FieldValues,
  ValidationOutcome,
} from '@umpire/core'
import type { AnyValidationMap } from './types.js'
import { isAsyncSafeParseValidator } from './guards.js'

export type AnyNormalizedValidationEntry<T = unknown> = {
  validate: (
    value: NonNullable<T>,
  ) => ValidationOutcome | Promise<ValidationOutcome>
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractSafeParseError(result: {
  success: boolean
}): string | undefined {
  const rec = result as Record<string, unknown>
  const err = rec.error
  if (!isRecord(err)) return undefined
  const errors = (err as Record<string, unknown>).errors
  if (!Array.isArray(errors) || errors.length === 0) return undefined
  const first = errors[0] as Record<string, unknown>
  return typeof first.message === 'string' ? first.message : undefined
}

export function normalizeAnyValidationEntry<T = unknown>(
  entry: unknown,
): AnyNormalizedValidationEntry<T> | null {
  if (typeof entry === 'function') {
    return {
      validate: entry as AnyNormalizedValidationEntry<T>['validate'],
    }
  }

  if (isNamedCheck<T>(entry)) {
    return { validate: entry.validate }
  }

  if (isAsyncSafeParseValidator<T>(entry)) {
    return {
      validate: async (value) => {
        const result = await entry.safeParseAsync(value)
        if (result.success) return true
        return { valid: false, error: extractSafeParseError(result) }
      },
    }
  }

  if (
    isRecord(entry) &&
    typeof (entry as Record<string, unknown>).safeParse === 'function'
  ) {
    return {
      validate: (value) => {
        const result = (
          entry as { safeParse(value: NonNullable<T>): { success: boolean } }
        ).safeParse(value)
        if (result.success) return true
        return { valid: false, error: extractSafeParseError(result) }
      },
    }
  }

  if (
    isRecord(entry) &&
    typeof (entry as Record<string, unknown>).test === 'function'
  ) {
    return {
      validate: (value) =>
        typeof value === 'string' &&
        (entry as { test(value: string): boolean }).test(value),
    }
  }

  if (isRecord(entry) && 'validator' in entry) {
    const inner = normalizeAnyValidationEntry<T>(entry.validator)
    if (!inner) return null
    const result: AnyNormalizedValidationEntry<T> = { validate: inner.validate }
    if ('error' in entry && typeof entry.error === 'string') {
      result.error = entry.error
    }
    return result
  }

  return null
}

export function normalizeAnyValidators<F extends Record<string, FieldDef>>(
  fields: F,
  validators: AnyValidationMap<F> | undefined,
): Partial<Record<keyof F & string, AnyNormalizedValidationEntry>> {
  const normalized: Record<string, AnyNormalizedValidationEntry> = {}

  if (!validators) {
    return normalized as Partial<
      Record<keyof F & string, AnyNormalizedValidationEntry>
    >
  }

  const fieldNames = new Set(Object.keys(fields))

  for (const [field, entry] of Object.entries(validators) as Array<
    [keyof F & string, unknown]
  >) {
    if (entry === undefined) {
      continue
    }

    if (!fieldNames.has(field)) {
      throw new Error(
        `[@umpire/async] Unknown field "${field}" referenced by validators`,
      )
    }

    const normalizedEntry = normalizeAnyValidationEntry(entry)

    if (!normalizedEntry) {
      throw new Error(
        `[@umpire/async] Invalid validator configured for field "${field}"`,
      )
    }

    normalized[field] = normalizedEntry
  }

  return normalized as Partial<
    Record<keyof F & string, AnyNormalizedValidationEntry>
  >
}

function normalizeOutcome(
  outcome: unknown,
  fallbackError?: string,
): { valid: boolean; error?: string } {
  if (typeof outcome === 'boolean') {
    return outcome ? { valid: true } : { valid: false, error: fallbackError }
  }

  if (
    typeof outcome === 'object' &&
    outcome !== null &&
    typeof (outcome as Record<string, unknown>).valid === 'boolean' &&
    (!('error' in (outcome as Record<string, unknown>)) ||
      (outcome as Record<string, unknown>).error === undefined ||
      typeof (outcome as Record<string, unknown>).error === 'string')
  ) {
    const vr = outcome as { valid: boolean; error?: string }
    return vr.valid
      ? { valid: true }
      : { valid: false, error: vr.error ?? fallbackError }
  }

  if (shouldWarnInDev()) {
    console.warn(
      '[@umpire/async] Validation functions must return a boolean or { valid, error? }. ' +
        'Received an unsupported result and treated it as invalid.',
    )
  }

  return { valid: false, error: fallbackError }
}

export async function attachValidationMetadataAsync<
  F extends Record<string, FieldDef>,
>(
  values: FieldValues<F>,
  availability: AvailabilityMap<F>,
  validators: Partial<Record<keyof F & string, AnyNormalizedValidationEntry>>,
  fieldNames: Array<keyof F & string>,
  signal: AbortSignal,
): Promise<AvailabilityMap<F>> {
  signal.throwIfAborted()

  const validated = { ...availability }

  const validationPromises = fieldNames
    .filter((field) => {
      const status = availability[field]
      return status.enabled && status.satisfied && validators[field]
    })
    .map(async (field) => {
      signal.throwIfAborted()
      const validator = validators[field]!
      const outcome = await validator.validate(
        values[field] as NonNullable<FieldValues<F>[typeof field]>,
      )
      return { field, outcome }
    })

  const results = await Promise.all(validationPromises)
  signal.throwIfAborted()

  for (const { field, outcome } of results) {
    const entry = validators[field]
    const fallbackError = entry?.error
    const normalized = normalizeOutcome(outcome, fallbackError)
    const status = validated[field]

    if (normalized.valid) {
      validated[field] = { ...status, valid: true }
    } else {
      validated[field] = {
        ...status,
        valid: false,
        error: normalized.error ?? status.error,
      }
    }
  }

  return validated
}
