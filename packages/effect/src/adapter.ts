import type {
  AvailabilityMap,
  FieldDef,
  InputValues,
  ValidationMap,
} from '@umpire/core'
import {
  flattenFieldErrorPaths,
  nestNamespacedValues,
  type NamespacedFieldOptions,
} from '@umpire/write'
import {
  deriveErrors,
  effectErrors,
  type DerivedErrorMap,
  type NormalizedFieldError,
} from './derive-errors.js'
import {
  decodeEffectSchema,
  isDecodeFailure,
  isDecodeSuccess,
  type EffectDecodeResult,
} from './effect-schema.js'
import {
  deriveSchema,
  type AnyEffectSchema,
  type DeriveSchemaOptions,
  type FieldSchemas,
} from './derive-schema.js'
import { Effect } from 'effect'
import { UmpireValidationError } from './errors.js'

export type CreateEffectAdapterOptions<F extends Record<string, FieldDef>> = {
  schemas: FieldSchemas<F>
  build?(schema: AnyEffectSchema): AnyEffectSchema
  valueShape?: 'flat' | 'nested'
  namespace?: NamespacedFieldOptions
} & DeriveSchemaOptions

export type EffectAdapterRunResult<F extends Record<string, FieldDef>> = {
  errors: DerivedErrorMap<F>
  normalizedErrors: NormalizedFieldError[]
  result: EffectDecodeResult<Record<string, unknown>>
  schemaFields: Array<keyof F & string>
}

export type EffectAdapter<F extends Record<string, FieldDef>> = {
  run(
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): EffectAdapterRunResult<F>
  validators: ValidationMap<F>
  runEffect(
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): Effect.Effect<EffectAdapterRunResult<F>, never, never>
  runValidate(
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): Effect.Effect<Record<string, unknown>, UmpireValidationError, never>
}

export function createEffectAdapter<F extends Record<string, FieldDef>>(
  options: CreateEffectAdapterOptions<F>,
): EffectAdapter<F> {
  const { schemas, build, rejectFoul } = options

  if (options.valueShape === 'nested' && !build) {
    throw new Error(
      '[@umpire/effect] valueShape: "nested" requires a build() callback because the derived per-field schema uses flat field keys.',
    )
  }

  const validators = {} as ValidationMap<F>

  for (const [field, schema] of Object.entries(schemas) as Array<
    [keyof F & string, AnyEffectSchema | undefined]
  >) {
    if (!schema) continue

    validators[field] = (value: unknown) => {
      const result = decodeEffectSchema(schema, value)
      if (isDecodeSuccess(result)) return { valid: true }

      const errors = effectErrors(result.error)
      const message = errors[0]?.message
      return message !== undefined
        ? { valid: false, error: message }
        : { valid: false }
    }
  }

  const runImpl = (
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): EffectAdapterRunResult<F> => {
    const baseSchema = deriveSchema(availability, schemas, { rejectFoul })
    const schema = build ? build(baseSchema) : baseSchema
    const validationValues =
      options.valueShape === 'nested'
        ? nestNamespacedValues(values, options.namespace)
        : values
    const result = decodeEffectSchema<Record<string, unknown>>(
      schema,
      validationValues,
      { errors: 'all' },
    )
    const rawErrors = isDecodeFailure(result) ? effectErrors(result.error) : []
    const normalizedErrors =
      options.valueShape === 'nested'
        ? flattenFieldErrorPaths(rawErrors, options.namespace)
        : rawErrors

    const schemaFields = (
      Object.keys(availability) as Array<keyof F & string>
    ).filter((field) => availability[field]!.enabled && field in schemas)

    return {
      errors: deriveErrors(availability, normalizedErrors),
      normalizedErrors,
      result,
      schemaFields,
    }
  }

  const runEffectFn = Effect.fn('@umpire/effect:runEffect')(
    (availability: AvailabilityMap<F>, values: InputValues) =>
      Effect.sync(() => runImpl(availability, values)),
  )

  const runValidateFn = Effect.fn('@umpire/effect:runValidate')(
    (availability: AvailabilityMap<F>, values: InputValues) =>
      Effect.gen(function* () {
        const result = yield* runEffectFn(availability, values)
        const hasErrors = Object.values(result.errors).some(
          (message) => message !== undefined,
        )
        if (!hasErrors && isDecodeSuccess(result.result)) {
          return result.result.value
        }
        return yield* Effect.fail(
          new UmpireValidationError({
            errors: result.errors,
            normalizedErrors: result.normalizedErrors,
          }),
        )
      }),
  )

  return {
    validators,
    run: runImpl,
    runEffect: runEffectFn,
    runValidate: runValidateFn,
  }
}
