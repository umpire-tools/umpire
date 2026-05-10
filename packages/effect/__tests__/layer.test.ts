import { enabledWhen, umpire } from '@umpire/core'
import type { Rule, Umpire, ValidationMap } from '@umpire/core'
import { Context, Effect } from 'effect'
import { umpireLayer } from '../src/layer.js'

describe('umpireLayer', () => {
  test('provides an umpire instance through a layer that can be used in Effect.gen', async () => {
    const fields = { name: { required: true }, email: { required: false } }
    const rules: Rule<typeof fields>[] = []

    const UmpTag = Context.Service<Umpire<typeof fields>>('Umpire')

    const live = umpireLayer(UmpTag, { fields, rules })

    const program = Effect.gen(function* () {
      const ump = yield* Effect.service(UmpTag)
      return ump.check({ name: 'Alice', email: 'a@b.com' })
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

    const UmpTag = Context.Service<Umpire<typeof fields>>('Umpire')

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

  test('wires validators through the provided umpire instance', async () => {
    const fields = { email: { required: true } }
    const rules: Rule<typeof fields>[] = []
    const validators: ValidationMap<typeof fields> = {
      email: (value) =>
        value === 'ok@example.com'
          ? { valid: true }
          : { valid: false, error: 'Enter a valid email' },
    }

    const UmpTag = Context.Service<Umpire<typeof fields>>('Umpire')
    const live = umpireLayer(UmpTag, { fields, rules, validators })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const ump = yield* Effect.service(UmpTag)
        return ump.check({ email: 'bad' })
      }).pipe(Effect.provide(live)),
    )

    expect(result.email).toMatchObject({
      valid: false,
      error: 'Enter a valid email',
    })
  })

  test('supports condition-aware rules through the layer', async () => {
    const fields = { companyName: { required: true } }
    const rules: Rule<typeof fields, { plan: 'personal' | 'business' }>[] = [
      enabledWhen(
        'companyName',
        (_values, conditions) => conditions.plan === 'business',
      ),
    ]

    const UmpTag =
      Context.Service<Umpire<typeof fields, { plan: 'personal' | 'business' }>>(
        'Umpire',
      )
    const live = umpireLayer(UmpTag, { fields, rules })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const ump = yield* Effect.service(UmpTag)
        return ump.check({ companyName: undefined }, { plan: 'business' })
      }).pipe(Effect.provide(live)),
    )

    expect(result.companyName).toMatchObject({
      enabled: true,
      required: true,
      satisfied: false,
    })
  })
})
