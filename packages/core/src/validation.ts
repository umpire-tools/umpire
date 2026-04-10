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

export type NormalizedValidationEntry<T = unknown> = {
  validate: (value: NonNullable<T>) => ValidationOutcome
  error?: string
}

type ValidationEntryObject<T = unknown> = {
  validator: ValidationValidator<T>
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

function isFieldValidator<T = unknown>(validator: unknown): validator is FieldValidator<T> {
  return typeof validator === 'function' ||
    isNamedCheck<T>(validator) ||
    isSafeParseValidator<T>(validator) ||
    isStringTestValidator(validator)
}

function isValidationValidator<T = unknown>(validator: unknown): validator is ValidationValidator<T> {
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
    isValidationValidator<T>(entry.validator) &&
    (!('error' in entry) || entry.error === undefined || typeof entry.error === 'string')
}

function normalizeValidationResult(
  result: unknown,
  fallbackError?: string,
): ValidationResult {
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
        '[umpire] Validation functions must return a boolean or { valid, error? }. ' +
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
  validator: ValidationValidator<T>,
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
  if (isValidationValidator<T>(entry)) {
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
  if (!isFieldValidator<T>(validator)) {
    return false
  }

  return normalizeValidationResult(toValidationFunction(validator)(value)).valid
}

export function runValidationEntry<T = unknown>(
  entry: NormalizedValidationEntry<T>,
  value: NonNullable<T>,
): ValidationResult {
  return normalizeValidationResult(entry.validate(value), entry.error)
}
