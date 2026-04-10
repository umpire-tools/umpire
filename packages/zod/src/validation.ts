import type {
  AvailabilityMap,
  FieldDef,
  InputValues,
  ValidationMap,
} from '@umpire/core'
import type { z } from 'zod'
import { activeErrors, zodErrors, type NormalizedFieldError } from './active-errors.js'
import { activeSchema } from './active-schema.js'
import { assertFieldSchemas, isRecord } from './schema-guards.js'

type FieldSchemas<F extends Record<string, FieldDef>> = Partial<
  Record<keyof F & string, z.ZodTypeAny>
>

type ZodIssueLike = {
  path: readonly (string | number)[]
  message: string
}

type ZodErrorLike = {
  issues: readonly ZodIssueLike[]
}

type ZodSafeParseResultLike =
  | { success: true }
  | { success: false; error: ZodErrorLike }

type ZodSchemaLike = {
  safeParse(value: unknown): ZodSafeParseResultLike
}

export type CreateZodValidationOptions<F extends Record<string, FieldDef>> = {
  schemas: FieldSchemas<F>
  build?(schema: z.ZodObject<Record<string, z.ZodTypeAny>>): ZodSchemaLike
}

export type ZodValidationRunResult<F extends Record<string, FieldDef>> = {
  errors: Partial<Record<keyof F & string, string>>
  normalizedErrors: NormalizedFieldError[]
  result: ZodSafeParseResultLike
  schemaFields: Array<keyof F & string>
}

export type ZodValidationAdapter<F extends Record<string, FieldDef>> = {
  run(
    availability: AvailabilityMap<F>,
    values: InputValues<F>,
  ): ZodValidationRunResult<F>
  validators: ValidationMap<F>
}

function firstIssueMessage(error: ZodErrorLike): string | undefined {
  return error.issues[0]?.message
}

function isFailedParseResult(result: unknown): result is Extract<ZodSafeParseResultLike, { success: false }> {
  return isRecord(result) &&
    result.success === false &&
    isRecord(result.error) &&
    Array.isArray(result.error.issues)
}

export function createZodValidation<F extends Record<string, FieldDef>>(
  options: CreateZodValidationOptions<F>,
): ZodValidationAdapter<F> {
  assertFieldSchemas(options.schemas, 'createZodValidation')

  const {
    schemas,
    build,
  } = options
  const validators = {} as ValidationMap<F>

  for (const [field, schema] of Object.entries(schemas) as Array<[keyof F & string, z.ZodTypeAny | undefined]>) {
    if (!schema) {
      continue
    }

    validators[field] = (value: unknown) => {
      const result = schema.safeParse(value)

      if (result.success) {
        return { valid: true }
      }

      const error = firstIssueMessage(result.error)

      return error === undefined
        ? { valid: false }
        : { valid: false, error }
    }
  }

  return {
    validators,
    run(availability, values) {
      const baseSchema = activeSchema(availability, schemas)
      const schema = build ? build(baseSchema) : baseSchema
      const result = schema.safeParse(values)
      const normalizedErrors = isFailedParseResult(result) ? zodErrors(result.error) : []

      return {
        errors: activeErrors(availability, normalizedErrors),
        normalizedErrors,
        result,
        schemaFields: Object.keys(baseSchema.shape) as Array<keyof F & string>,
      }
    },
  }
}
