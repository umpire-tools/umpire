import type { FieldDef, Umpire } from '@umpire/core'
import { snapshotValue } from '@umpire/core/snapshot'
import {
  fromStore,
  type FromStoreOptions,
  type UmpireStore,
} from '@umpire/store'

export type VuexStoreApi<S> = {
  state: S
  subscribe(listener: (mutation: unknown, state: S) => void): () => void
}

function snapshotState<S>(state: S): S {
  return snapshotValue(state)
}

export function fromVuexStore<
  S,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  store: VuexStoreApi<S>,
  options: FromStoreOptions<S, F, C>,
): UmpireStore<F> {
  let prevState = snapshotState(store.state)

  return fromStore(ump, {
    getState: () => store.state,
    subscribe(listener) {
      return store.subscribe((_mutation, nextState) => {
        const currentPrevState = prevState

        prevState = snapshotState(nextState)
        listener(nextState, currentPrevState)
      })
    },
  }, options)
}

export type {
  FromStoreOptions,
  UmpireStore,
} from '@umpire/store'
