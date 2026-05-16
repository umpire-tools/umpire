import type { FieldDef } from '@umpire/core'
import type { AsyncWriteValidationAdapter } from '@umpire/write'
import type { Effect } from 'effect'
import type { EffectAdapter, EffectAdapterRunResult } from './adapter.js'

export type EffectAdapterRunner<R> = <A>(
  effect: Effect.Effect<A, never, R>,
) => Promise<A>

export function toAsyncWriteValidationAdapter<
  F extends Record<string, FieldDef>,
  Out,
  R,
>(
  adapter: Pick<EffectAdapter<F, Out, R>, 'runEffect'>,
  run: EffectAdapterRunner<R>,
): AsyncWriteValidationAdapter<F> {
  return {
    run(availability, values) {
      return run(adapter.runEffect(availability, values)) as Promise<
        EffectAdapterRunResult<F, Out>
      >
    },
  }
}
