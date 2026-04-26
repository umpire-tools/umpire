import { Either, ParseResult, Schema } from 'effect'
import type {
  AvailabilityMap,
  FieldDef,
  InputValues,
  ValidationMap,
} from '@umpire/core'
import {
  deriveErrors,
  effectErrors,
  type DerivedErrorMap,
  type NormalizedFieldError,
} from './derive-errors.js'
import {
  deriveSchema,
  type AnyEffectSchema,
  type DeriveSchemaOptions,
  type FieldSchemas,
} from './derive-schema.js'

export type CreateEffectAdapterOptions<F extends Record<string, FieldDef>> = {
  schemas: FieldSchemas<F>
  build?(schema: Schema.Schema.AnyNoContext): Schema.Schema.AnyNoContext
} & DeriveSchemaOptions

export type EffectAdapterRunResult<F extends Record<string, FieldDef>> = {
  errors: DerivedErrorMap<F>
  normalizedErrors: NormalizedFieldError[]
  result: Either.Either<Record<string, unknown>, ParseResult.ParseError>
  schemaFields: Array<keyof F & string>
}

export type EffectAdapter<F extends Record<string, FieldDef>> = {
  run(
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): EffectAdapterRunResult<F>
  validators: ValidationMap<F>
}

export function createEffectAdapter<F extends Record<string, FieldDef>>(
  options: CreateEffectAdapterOptions<F>,
): EffectAdapter<F> {
  const { schemas, build, rejectFoul } = options
  const validators = {} as ValidationMap<F>

  for (const [field, schema] of Object.entries(schemas) as Array<
    [keyof F & string, AnyEffectSchema | undefined]
  >) {
    if (!schema) continue

    const decode = Schema.decodeUnknownEither(schema)

    validators[field] = (value: unknown) => {
      const result = decode(value)
      if (Either.isRight(result)) return { valid: true }

      const errors = effectErrors(result.left)
      const message = errors[0]?.message
      return message !== undefined
        ? { valid: false, error: message }
        : { valid: false }
    }
  }

  return {
    validators,
    run(availability, values) {
      const baseSchema = deriveSchema(availability, schemas, { rejectFoul })
      const schema = build ? build(baseSchema) : baseSchema
      const decode = Schema.decodeUnknownEither(schema)
      const result = decode(values, { errors: 'all' }) as Either.Either<
        Record<string, unknown>,
        ParseResult.ParseError
      >
      const normalizedErrors = Either.isLeft(result)
        ? effectErrors(result.left)
        : []

      const schemaFields = (
        Object.keys(availability) as Array<keyof F & string>
      ).filter((field) => availability[field]!.enabled && field in schemas)

      return {
        errors: deriveErrors(availability, normalizedErrors),
        normalizedErrors,
        result,
        schemaFields,
      }
    },
  }
}
