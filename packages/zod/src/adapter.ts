import type {
  AvailabilityMap,
  FieldDef,
  InputValues,
  ValidationMap,
} from '@umpire/core'
import { isRecord } from '@umpire/core/guards'
import {
  flattenFieldErrorPaths,
  nestNamespacedValues,
  type NamespacedFieldOptions,
} from '@umpire/write'
import type { z } from 'zod'
import {
  deriveErrors,
  zodErrors,
  type NormalizedFieldError,
} from './derive-errors.js'
import { deriveSchema, type DeriveSchemaOptions } from './derive-schema.js'
import { assertFieldSchemas } from './schema-guards.js'
import type {
  ZodSafeParseResultLike,
  ZodSchemaLike,
  ZodErrorLike,
} from './zod-types.js'

type FieldSchemas<F extends Record<string, FieldDef>> = Partial<
  Record<keyof F & string, z.ZodTypeAny>
>

export type CreateZodAdapterOptions<F extends Record<string, FieldDef>> = {
  schemas: FieldSchemas<F>
  build?(schema: z.ZodObject<Record<string, z.ZodTypeAny>>): ZodSchemaLike
  valueShape?: 'flat' | 'nested'
  namespace?: NamespacedFieldOptions
} & DeriveSchemaOptions

export type ZodAdapterRunResult<F extends Record<string, FieldDef>> = {
  errors: Partial<Record<keyof F & string, string>>
  normalizedErrors: NormalizedFieldError[]
  result: ZodSafeParseResultLike
  schemaFields: Array<keyof F & string>
}

export type ZodAdapter<F extends Record<string, FieldDef>> = {
  run(
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): ZodAdapterRunResult<F>
  validators: ValidationMap<F>
}

function firstIssueMessage(error: ZodErrorLike): string | undefined {
  return error.issues[0]?.message
}

function isFailedParseResult(
  result: unknown,
): result is Extract<ZodSafeParseResultLike, { success: false }> {
  return (
    isRecord(result) &&
    result.success === false &&
    isRecord(result.error) &&
    Array.isArray(result.error.issues)
  )
}

export function createZodAdapter<F extends Record<string, FieldDef>>(
  options: CreateZodAdapterOptions<F>,
): ZodAdapter<F> {
  assertFieldSchemas(options.schemas, 'createZodAdapter')

  const { schemas, build, rejectFoul } = options

  if (options.valueShape === 'nested' && !build) {
    throw new Error(
      '[@umpire/zod] valueShape: "nested" requires a build() callback because the derived per-field schema uses flat field keys.',
    )
  }

  const validators = {} as ValidationMap<F>

  for (const [field, schema] of Object.entries(schemas) as Array<
    [keyof F & string, z.ZodTypeAny | undefined]
  >) {
    if (!schema) {
      continue
    }

    validators[field] = (value: unknown) => {
      const result = schema.safeParse(value)

      if (result.success) {
        return { valid: true }
      }

      const error = firstIssueMessage(result.error)

      return error === undefined ? { valid: false } : { valid: false, error }
    }
  }

  return {
    validators,
    run(availability, values) {
      const baseSchema = deriveSchema(availability, schemas, { rejectFoul })
      const schema = build ? build(baseSchema) : baseSchema
      const validationValues =
        options.valueShape === 'nested'
          ? nestNamespacedValues(values, options.namespace)
          : values
      const result = schema.safeParse(validationValues)
      const rawErrors = isFailedParseResult(result)
        ? zodErrors(result.error)
        : []
      const normalizedErrors =
        options.valueShape === 'nested'
          ? flattenFieldErrorPaths(rawErrors, options.namespace)
          : rawErrors

      return {
        errors: deriveErrors(availability, normalizedErrors),
        normalizedErrors,
        result,
        schemaFields: Object.keys(baseSchema.shape) as Array<keyof F & string>,
      }
    },
  }
}
