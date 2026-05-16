import { enabledWhen, umpire as asyncUmpire } from '@umpire/async'
import type { AnyRule, Umpire as AsyncUmpire } from '@umpire/async'
import { Context, Effect } from 'effect'
import { umpireAsyncLayer } from '../src/async-layer.js'

describe('umpireAsyncLayer', () => {
  test('provides an async umpire instance through a layer', async () => {
    const fields = { name: { required: true }, email: { required: false } }
    const rules: AnyRule<typeof fields>[] = []

    const UmpTag = Context.Service<AsyncUmpire<typeof fields>>('Umpire')

    const live = umpireAsyncLayer(UmpTag, { fields, rules })

    const program = Effect.gen(function* () {
      const ump = yield* Effect.service(UmpTag)
      return yield* Effect.promise(() =>
        ump.check({ name: 'Alice', email: 'a@b.com' }),
      )
    })

    const result = await Effect.runPromise(Effect.provide(program, live))

    expect(result).toMatchObject({
      name: { satisfied: true, enabled: true },
      email: { satisfied: true, enabled: true },
    })
  })

  test('layer produces the same availability as direct async umpire() call', async () => {
    const fields = { name: { required: true } }
    const rules: AnyRule<typeof fields>[] = []

    const UmpTag = Context.Service<AsyncUmpire<typeof fields>>('Umpire')
    const live = umpireAsyncLayer(UmpTag, { fields, rules })

    const program = Effect.gen(function* () {
      const ump = yield* Effect.service(UmpTag)
      return yield* Effect.promise(() => ump.check({ name: 'Alice' }))
    })

    const layerResult = await Effect.runPromise(Effect.provide(program, live))
    const direct = await asyncUmpire({ fields, rules }).check({ name: 'Alice' })

    expect(layerResult).toEqual(direct)
  })

  test('supports async condition-aware rules through the layer', async () => {
    const fields = { companyName: { required: true } }
    const rules: AnyRule<typeof fields, { plan: 'personal' | 'business' }>[] = [
      enabledWhen(
        'companyName',
        (_values, conditions) => conditions.plan === 'business',
      ),
    ]

    const UmpTag =
      Context.Service<
        AsyncUmpire<typeof fields, { plan: 'personal' | 'business' }>
      >('Umpire')
    const live = umpireAsyncLayer(UmpTag, { fields, rules })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const ump = yield* Effect.service(UmpTag)
        return yield* Effect.promise(() =>
          ump.check({ companyName: undefined }, { plan: 'business' }),
        )
      }).pipe(Effect.provide(live)),
    )

    expect(result.companyName).toMatchObject({
      enabled: true,
      required: true,
      satisfied: false,
    })
  })
})
