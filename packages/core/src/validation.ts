import { shouldWarnInDev } from './dev.js'
import type {
  FieldValidator,
  NamedCheck,
  SafeParseValidator,
  ValidationOutcome,
  StringTestValidator,
  ValidationResult,
  ValidationValidator,
} from './types.js'
import { isRecord } from './guards.js'

export type NormalizedValidationEntry<T = unknown> = {
  validate: (value: NonNullable<T>) => ValidationOutcome
  error?: string
}

type NormalizedValidationResult =
  | { valid: true }
  | { valid: false; error?: string }

// `check()` remains boolean-only at the public API boundary, but the runtime
// validator shapes are otherwise shared with richer validation entries.
type SupportedValidator<T = unknown> = FieldValidator<T> | ValidationValidator<T>

type ValidationEntryObject<T = unknown> = {
  validator: ValidationValidator<T>
  error?: string
}

function isSafeParseValidator<T = unknown>(validator: unknown): validator is SafeParseValidator<T> {
  return isRecord(validator) && typeof validator.safeParse === 'function'
}

function isStringTestValidator(validator: unknown): validator is StringTestValidator {
  return isRecord(validator) && typeof validator.test === 'function'
}

export function isNamedCheck<T = unknown>(validator: unknown): validator is NamedCheck<T> {
  return isRecord(validator) &&
    typeof validator.__check === 'string' &&
    typeof validator.validate === 'function'
}

function isSupportedValidator<T = unknown>(validator: unknown): validator is SupportedValidator<T> {
  return typeof validator === 'function' ||
    isNamedCheck<T>(validator) ||
    isSafeParseValidator<T>(validator) ||
    isStringTestValidator(validator)
}

function isValidationResult(result: unknown): result is ValidationResult {
  return isRecord(result) &&
    typeof result.valid === 'boolean' &&
    (!('error' in result) || result.error === undefined || typeof result.error === 'string')
}

function isValidationEntryObject<T = unknown>(entry: unknown): entry is ValidationEntryObject<T> {
  return isRecord(entry) &&
    'validator' in entry &&
    isSupportedValidator<T>(entry.validator) &&
    (!('error' in entry) || entry.error === undefined || typeof entry.error === 'string')
}

function normalizeValidationResult(
  result: unknown,
  fallbackError?: string,
): NormalizedValidationResult {
  if (typeof result === 'boolean') {
    return result
      ? { valid: true }
      : fallbackError === undefined
        ? { valid: false }
        : { valid: false, error: fallbackError }
  }

  if (!isValidationResult(result)) {
    if (shouldWarnInDev()) {
      console.warn(
        '[@umpire/core] Validation functions must return a boolean or { valid, error? }. ' +
        'Received an unsupported result and treated it as invalid.',
      )
    }

    return fallbackError === undefined
      ? { valid: false }
      : { valid: false, error: fallbackError }
  }

  if (result.valid) {
    return { valid: true }
  }

  if (result.error !== undefined) {
    return { valid: false, error: result.error }
  }

  return fallbackError === undefined
    ? { valid: false }
    : { valid: false, error: fallbackError }
}

function toValidationFunction<T = unknown>(
  validator: SupportedValidator<T>,
): (value: NonNullable<T>) => ValidationOutcome {
  if (typeof validator === 'function') {
    return validator
  }

  if (isNamedCheck<T>(validator)) {
    return validator.validate
  }

  if (isSafeParseValidator<T>(validator)) {
    return (value) => validator.safeParse(value).success
  }

  return (value) => typeof value === 'string' && validator.test(value)
}

export function normalizeValidationEntry<T = unknown>(
  entry: unknown,
): NormalizedValidationEntry<T> | null {
  if (isSupportedValidator<T>(entry)) {
    return { validate: toValidationFunction(entry) }
  }

  if (!isValidationEntryObject<T>(entry)) {
    return null
  }

  const normalized: NormalizedValidationEntry<T> = {
    validate: toValidationFunction(entry.validator),
  }

  if (entry.error !== undefined) {
    normalized.error = entry.error
  }

  return normalized
}

export function runFieldValidator<T = unknown>(
  validator: FieldValidator<T>,
  value: NonNullable<T>,
): boolean {
  if (!isSupportedValidator<T>(validator)) {
    return false
  }

  return normalizeValidationResult(toValidationFunction(validator)(value)).valid
}

export function runValidationEntry<T = unknown>(
  entry: NormalizedValidationEntry<T>,
  value: NonNullable<T>,
): NormalizedValidationResult {
  return normalizeValidationResult(entry.validate(value), entry.error)
}
