import { Schema } from 'effect'
import { createEffectAdapter } from './adapter.js'
import type { AnyEffectSchema } from './derive-schema.js'

type Expect<T extends true> = T
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

const _inferred = createEffectAdapter()({
  schemas: {
    age: Schema.NumberFromString,
  },
})

type InferredOutput = Awaited<
  ReturnType<
    typeof _inferred.runValidate
  > extends import('effect').Effect.Effect<infer A, unknown, unknown>
    ? Promise<A>
    : never
>

type _inferredOutputCheck = Expect<
  InferredOutput extends { age?: number } ? true : false
>

type ServiceEnv = { readonly service: unique symbol }

const serviceSchema = Schema.NumberFromString as AnyEffectSchema<
  number,
  ServiceEnv
>

const effectOnly = createEffectAdapter()({
  schemas: {
    age: serviceSchema,
  },
})

// @ts-expect-error serviceful schemas cannot expose sync run()
effectOnly.run({} as never, {})

// @ts-expect-error serviceful schemas cannot expose sync validators
void effectOnly.validators

type EffectOnlyContext =
  ReturnType<
    typeof effectOnly.runValidate
  > extends import('effect').Effect.Effect<unknown, unknown, infer R>
    ? R
    : never

type _serviceContextCheck = Expect<Equal<EffectOnlyContext, ServiceEnv>>

const _builtOverride = createEffectAdapter()({
  schemas: {
    age: Schema.NumberFromString,
  },
  build: () =>
    Schema.Struct({
      user: Schema.Struct({
        age: Schema.Number,
      }),
    }),
})

type BuiltOutput = Awaited<
  ReturnType<
    typeof _builtOverride.runValidate
  > extends import('effect').Effect.Effect<infer A, unknown, unknown>
    ? Promise<A>
    : never
>

type _buildOutputCheck = Expect<
  BuiltOutput extends { user: { age: number } } ? true : false
>
