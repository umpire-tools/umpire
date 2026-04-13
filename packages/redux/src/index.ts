import type { FieldDef, Umpire } from '@umpire/core'
import { snapshotValue } from '@umpire/core/snapshot'
import {
  fromStore,
  type FromStoreOptions,
  type UmpireStore,
} from '@umpire/store'

export type ReduxStoreApi<S> = {
  getState(): S
  subscribe(listener: () => void): () => void
}

export function fromReduxStore<
  S,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  store: ReduxStoreApi<S>,
  options: FromStoreOptions<S, F, C>,
): UmpireStore<F> {
  let prevState = snapshotValue(store.getState())

  return fromStore(ump, {
    getState: () => store.getState(),
    subscribe(listener) {
      return store.subscribe(() => {
        const nextState = store.getState()
        const currentPrevState = prevState

        prevState = snapshotValue(nextState)
        listener(nextState, currentPrevState)
      })
    },
  }, options)
}

export type {
  FromStoreOptions,
  UmpireStore,
} from '@umpire/store'
