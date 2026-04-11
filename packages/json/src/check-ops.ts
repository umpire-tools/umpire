import type { JsonPrimitive, NamedCheck, NamedCheckMetadata } from '@umpire/core'

import type {
  JsonCheckRule,
  JsonValidatorDef,
  JsonValidatorOp,
  JsonValidatorSpec,
} from './schema.js'

type Params = Readonly<Record<string, JsonPrimitive>>

const EMAIL_REGEX = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/

function createNamedValidator<T>(
  name: JsonValidatorOp,
  validate: (value: NonNullable<T>) => boolean,
  params?: Params,
): NamedCheck<T> {
  if (!params) {
    return Object.freeze({
      __check: name,
      validate,
    })
  }

  return Object.freeze({
    __check: name,
    params,
    validate,
  })
}

function isLengthLike(value: unknown): value is { length: number } {
  return (typeof value === 'string' || Array.isArray(value)) && typeof value.length === 'number'
}

export const namedValidators = Object.freeze({
  email() {
    return createNamedValidator<string>('email', (value) => EMAIL_REGEX.test(value))
  },
  url() {
    return createNamedValidator<string>('url', (value) => {
      try {
        const url = new URL(value)
        return url.protocol.length > 0
      } catch {
        return false
      }
    })
  },
  matches(pattern: string) {
    const regex = new RegExp(pattern)
    return createNamedValidator<string>('matches', (value) => regex.test(value), { pattern })
  },
  minLength(value: number) {
    return createNamedValidator<string | unknown[]>('minLength', (input) =>
      isLengthLike(input) && input.length >= value, { value })
  },
  maxLength(value: number) {
    return createNamedValidator<string | unknown[]>('maxLength', (input) =>
      isLengthLike(input) && input.length <= value, { value })
  },
  min(value: number) {
    return createNamedValidator<number>('min', (input) => typeof input === 'number' && input >= value, {
      value,
    })
  },
  max(value: number) {
    return createNamedValidator<number>('max', (input) => typeof input === 'number' && input <= value, {
      value,
    })
  },
  range(min: number, max: number) {
    return createNamedValidator<number>(
      'range',
      (input) => typeof input === 'number' && input >= min && input <= max,
      { min, max },
    )
  },
  integer() {
    return createNamedValidator<number>('integer', (input) => Number.isInteger(input))
  },
})

export function defaultValidatorMessage(rule: JsonValidatorSpec | NamedCheckMetadata): string {
  const metadata = 'op' in rule
    ? ({ __check: rule.op, params: paramsFromValidatorSpec(rule) } satisfies NamedCheckMetadata)
    : rule

  switch (metadata.__check) {
    case 'email':
      return 'Must be a valid email address'
    case 'url':
      return 'Must be a valid URL'
    case 'matches':
      return 'Must match the required format'
    case 'minLength':
      return `Must be at least ${metadata.params?.value} characters`
    case 'maxLength':
      return `Must be ${metadata.params?.value} characters or fewer`
    case 'min':
      return `Must be at least ${metadata.params?.value}`
    case 'max':
      return `Must be ${metadata.params?.value} or less`
    case 'range':
      return `Must be between ${metadata.params?.min} and ${metadata.params?.max}`
    case 'integer':
      return 'Must be a whole number'
    default:
      return 'Invalid value'
  }
}

function paramsFromValidatorSpec(rule: JsonValidatorSpec): Params | undefined {
  switch (rule.op) {
    case 'matches':
      return { pattern: rule.pattern }
    case 'minLength':
    case 'maxLength':
    case 'min':
    case 'max':
      return { value: rule.value }
    case 'range':
      return { min: rule.min, max: rule.max }
    default:
      return undefined
  }
}

function paramsFromNamedCheckMetadata(metadata: NamedCheckMetadata): Params | undefined {
  return metadata.params
}

export function createValidatorSpecFromMetadata(
  metadata: NamedCheckMetadata,
): JsonValidatorSpec | undefined {
  const params = paramsFromNamedCheckMetadata(metadata)

  switch (metadata.__check) {
    case 'email':
    case 'url':
    case 'integer':
      return { op: metadata.__check }
    case 'matches':
      if (typeof params?.pattern !== 'string') {
        return undefined
      }
      return { op: 'matches', pattern: params.pattern }
    case 'minLength':
    case 'maxLength':
    case 'min':
    case 'max':
      if (typeof params?.value !== 'number') {
        return undefined
      }
      return { op: metadata.__check, value: params.value }
    case 'range':
      if (typeof params?.min !== 'number' || typeof params?.max !== 'number') {
        return undefined
      }
      return { op: 'range', min: params.min, max: params.max }
    default:
      return undefined
  }
}

export function createCheckRuleFromMetadata(
  field: string,
  metadata: NamedCheckMetadata,
  reason?: string,
): JsonCheckRule | undefined {
  const resolvedReason = reason && reason !== defaultValidatorMessage(metadata) ? reason : undefined
  const spec = createValidatorSpecFromMetadata(metadata)

  if (!spec) {
    return undefined
  }

  return resolvedReason
    ? { type: 'check', field, reason: resolvedReason, ...spec }
    : { type: 'check', field, ...spec }
}

export function createValidatorDefFromMetadata(
  metadata: NamedCheckMetadata,
  error?: string,
): JsonValidatorDef | undefined {
  const spec = createValidatorSpecFromMetadata(metadata)

  if (!spec) {
    return undefined
  }

  return error === undefined
    ? spec
    : { ...spec, error }
}

export function createNamedValidatorFromSpec(spec: JsonValidatorSpec): NamedCheck<any> {
  switch (spec.op) {
    case 'email':
      return namedValidators.email()
    case 'url':
      return namedValidators.url()
    case 'matches':
      return namedValidators.matches(spec.pattern)
    case 'minLength':
      return namedValidators.minLength(spec.value)
    case 'maxLength':
      return namedValidators.maxLength(spec.value)
    case 'min':
      return namedValidators.min(spec.value)
    case 'max':
      return namedValidators.max(spec.value)
    case 'range':
      return namedValidators.range(spec.min, spec.max)
    case 'integer':
      return namedValidators.integer()
  }
}

export const createNamedValidatorFromRule: (rule: JsonCheckRule) => NamedCheck<any> = createNamedValidatorFromSpec

export function assertValidValidatorSpec(rule: JsonValidatorSpec): void {
  switch (rule.op) {
    case 'email':
    case 'url':
    case 'integer':
      return
    case 'matches':
      try {
        new RegExp(rule.pattern)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`[umpire/json] Invalid regex pattern "${rule.pattern}": ${message}`)
      }
      return
    case 'minLength':
    case 'maxLength':
    case 'min':
    case 'max':
      if (typeof rule.value !== 'number' || Number.isNaN(rule.value)) {
        throw new Error(`[umpire/json] Validator "${rule.op}" requires a numeric value`)
      }
      return
    case 'range':
      if (
        typeof rule.min !== 'number' ||
        Number.isNaN(rule.min) ||
        typeof rule.max !== 'number' ||
        Number.isNaN(rule.max)
      ) {
        throw new Error('[umpire/json] Validator "range" requires numeric min and max values')
      }
      return
    default:
      throw new Error(`[umpire/json] Unknown validator op "${String((rule as { op?: unknown }).op)}"`)
  }
}

export function assertValidCheckRule(rule: JsonCheckRule): void {
  assertValidValidatorSpec(rule)
}
