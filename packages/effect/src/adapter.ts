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
  type ExtractR,
  type FieldSchemas,
  type InferBaseOutput,
} from './derive-schema.js'
import { Effect } from 'effect'
import { UmpireValidationError } from './errors.js'

type SchemaOutput<S> = S extends AnyEffectSchema<infer A, unknown> ? A : never

type ValidationContext<
  F extends Record<string, FieldDef>,
  Schemas extends FieldSchemas<F>,
  BuiltSchema extends AnyEffectSchema<unknown, unknown>,
> =
  | ExtractR<Schemas>
  | (BuiltSchema extends AnyEffectSchema<unknown, infer R> ? R : never)

export type CreateEffectAdapterOptions<
  F extends Record<string, FieldDef>,
  Schemas extends FieldSchemas<F>,
  BuiltSchema extends AnyEffectSchema<unknown, unknown>,
> = {
  schemas: Schemas
  build?(
    schema: AnyEffectSchema<InferBaseOutput<F, Schemas>, ExtractR<Schemas>>,
  ): BuiltSchema
  valueShape?: 'flat' | 'nested'
  namespace?: NamespacedFieldOptions
} & DeriveSchemaOptions

export type EffectAdapterRunResult<F extends Record<string, FieldDef>> = {
  errors: DerivedErrorMap<F>
  normalizedErrors: NormalizedFieldError[]
  result: EffectDecodeResult<Record<string, unknown>>
  schemaFields: Array<keyof F & string>
}

export type EffectAdapter<F extends Record<string, FieldDef>, Out, R> = {
  run(
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): EffectAdapterRunResult<F>
  validators: ValidationMap<F>
  runEffect(
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): Effect.Effect<EffectAdapterRunResult<F>, never, R>
  runValidate(
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): Effect.Effect<Out, UmpireValidationError, R>
}

export function createEffectAdapter<
  F extends Record<string, FieldDef> = Record<string, FieldDef>,
>() {
  return function <
    Schemas extends FieldSchemas<F>,
    BuiltSchema extends AnyEffectSchema<unknown, unknown> = AnyEffectSchema<
      InferBaseOutput<F, Schemas>,
      ExtractR<Schemas>
    >,
    Out = SchemaOutput<BuiltSchema>,
    R = ValidationContext<F, Schemas, BuiltSchema>,
  >(
    options: CreateEffectAdapterOptions<F, Schemas, BuiltSchema>,
  ): EffectAdapter<F, Out, R> {
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
      const { schema, validationValues } = prepareRun(availability, values)
      const result = decodeEffectSchema<Record<string, unknown>>(
        schema as unknown as AnyEffectSchema<Record<string, unknown>, never>,
        validationValues,
        { errors: 'all' },
      )
      return finalizeRun(availability, result)
    }

    const prepareRun = (
      availability: AvailabilityMap<F>,
      values: InputValues,
    ) => {
      const baseSchema = deriveSchema(availability, schemas, { rejectFoul })
      const schema = build ? build(baseSchema) : baseSchema
      const validationValues =
        options.valueShape === 'nested'
          ? nestNamespacedValues(values, options.namespace)
          : values
      return { schema, validationValues }
    }

    const finalizeRun = (
      availability: AvailabilityMap<F>,
      result: EffectDecodeResult<Record<string, unknown>>,
    ): EffectAdapterRunResult<F> => {
      const rawErrors = isDecodeFailure(result)
        ? effectErrors(result.error)
        : []
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

    const runEffectFn: (
      availability: AvailabilityMap<F>,
      values: InputValues,
    ) => Effect.Effect<EffectAdapterRunResult<F>, never, R> = Effect.fn(
      '@umpire/effect:runEffect',
    )((availability: AvailabilityMap<F>, values: InputValues) =>
      Effect.sync(() => runImpl(availability, values)),
    ) as (
      availability: AvailabilityMap<F>,
      values: InputValues,
    ) => Effect.Effect<EffectAdapterRunResult<F>, never, R>

    const runValidateFn: (
      availability: AvailabilityMap<F>,
      values: InputValues,
    ) => Effect.Effect<Out, UmpireValidationError, R> = Effect.fn(
      '@umpire/effect:runValidate',
    )((availability: AvailabilityMap<F>, values: InputValues) =>
      Effect.gen(function* () {
        const result = yield* runEffectFn(availability, values)
        if (isDecodeSuccess(result.result)) {
          return result.result.value as Out
        }
        return yield* Effect.fail(
          new UmpireValidationError({
            errors: result.errors,
            normalizedErrors: result.normalizedErrors,
          }),
        )
      }),
    ) as (
      availability: AvailabilityMap<F>,
      values: InputValues,
    ) => Effect.Effect<Out, UmpireValidationError, R>

    return {
      validators,
      run: runImpl,
      runEffect: runEffectFn,
      runValidate: runValidateFn,
    }
  }
}
