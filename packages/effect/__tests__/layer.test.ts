import { umpire } from '@umpire/core'
import type { Rule, Umpire } from '@umpire/core'
import { Context, Effect } from 'effect'
import { umpireLayer } from '../src/layer.js'

describe('umpireLayer', () => {
  test('provides an umpire instance through a layer that can be used in Effect.gen', async () => {
    const fields = { name: { required: true }, email: { required: false } }
    const rules: Rule<typeof fields>[] = []

    const UmpTag = Context.Service<Umpire<typeof fields>>()

    const live = umpireLayer(UmpTag, { fields, rules })

    const program = Effect.gen(function* () {
      const opt = yield* Effect.serviceOption(UmpTag)
      if (opt._tag === 'None') return { missing: true } as const
      return opt.value.check({ name: 'Alice', email: 'a@b.com' })
    })

    const result = await Effect.runPromise(Effect.provide(program, live))

    expect(result).toMatchObject({
      name: { satisfied: true, enabled: true },
      email: { satisfied: true, enabled: true },
    })
  })

  test('layer produces the same availability as direct umpire() call', async () => {
    const fields = { name: { required: true } }
    const rules: Rule<typeof fields>[] = []

    const UmpTag = Context.Service<Umpire<typeof fields>>()

    const live = umpireLayer(UmpTag, { fields, rules })

    const program = Effect.gen(function* () {
      const opt = yield* Effect.serviceOption(UmpTag)
      if (opt._tag === 'None') throw new Error('missing')
      return opt.value.check({ name: 'Alice' })
    })

    const layerResult = await Effect.runPromise(Effect.provide(program, live))
    const direct = umpire({ fields, rules }).check({ name: 'Alice' })

    expect(layerResult).toEqual(direct)
  })
})
