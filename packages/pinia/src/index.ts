import type { FieldDef, Umpire } from '@umpire/core'
import {
  fromStore,
  trackPreviousState,
  type FromStoreOptions,
  type UmpireStore,
} from '@umpire/store'

export type PiniaStoreApi<S> = {
  $state: S
  $subscribe(listener: (mutation: unknown, state: S) => void): () => void
}

export function fromPiniaStore<
  S,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  store: PiniaStoreApi<S>,
  options: FromStoreOptions<S, C>,
): UmpireStore<F> {
  const previousState = trackPreviousState(store.$state)

  return fromStore(
    ump,
    {
      getState: () => store.$state,
      subscribe(listener) {
        return store.$subscribe((_mutation, nextState) => {
          listener(nextState, previousState.next(nextState))
        })
      },
    },
    options,
  )
}

export type { FromStoreOptions, UmpireStore } from '@umpire/store'
