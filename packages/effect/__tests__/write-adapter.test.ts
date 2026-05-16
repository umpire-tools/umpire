import { describe, expect, test } from 'bun:test'
import { Context, Effect, Layer, Schema } from 'effect'
import { umpire } from '@umpire/core'
import { runWriteValidationAdapterAsync } from '@umpire/write'
import {
  createEffectAdapter,
  toAsyncWriteValidationAdapter,
} from '../src/index.js'

describe('toAsyncWriteValidationAdapter', () => {
  test('adapts context-free Effect validation to the async write protocol', async () => {
    const validation = createEffectAdapter()({
      schemas: {
        email: Schema.String.check(
          Schema.makeFilter((value) =>
            value.includes('@') ? undefined : 'Enter a valid email',
          ),
        ),
      },
    })
    const writeValidation = toAsyncWriteValidationAdapter(
      validation,
      Effect.runPromise,
    )
    const ump = umpire({
      fields: { email: { required: true } },
      rules: [],
    })
    const availability = ump.check({ email: 'bad' })

    const result = await runWriteValidationAdapterAsync(
      writeValidation,
      availability,
      { email: 'bad' },
    )

    expect(result?.schemaIssues).toEqual([
      { field: 'email', message: 'Enter a valid email' },
    ])
  })

  test('lets callers provide services when adapting serviceful schemas', async () => {
    const ParseService = Context.Service<{ parse: (s: string) => number }>(
      'ParseService',
    )
    const servicefulSchema: Schema.Decoder<
      number,
      { parse: (s: string) => number }
    > = Schema.declareConstructor()(
      [],
      () => (input: unknown, _ast: never) =>
        Effect.gen(function* () {
          const svc = yield* Effect.service(ParseService)
          if (typeof input === 'string') return svc.parse(input)
          return yield* Effect.fail(
            new Schema.SchemaError('not a string' as never),
          )
        }),
    )
    const validation = createEffectAdapter()({
      schemas: { value: servicefulSchema },
    })
    const writeValidation = toAsyncWriteValidationAdapter(
      validation,
      (effect) =>
        Effect.runPromise(
          Effect.provide(
            effect,
            Layer.succeed(ParseService, { parse: (value) => Number(value) }),
          ),
        ),
    )
    const ump = umpire({
      fields: { value: { required: true } },
      rules: [],
    })
    const availability = ump.check({ value: '42' })

    const result = await runWriteValidationAdapterAsync(
      writeValidation,
      availability,
      { value: '42' },
    )

    expect(result?.schemaIssues).toEqual([])
    expect(result?.validationResult).toEqual({
      _tag: 'Right',
      value: { value: 42 },
    })
  })
})
