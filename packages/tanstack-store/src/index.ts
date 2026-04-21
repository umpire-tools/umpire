import type { FieldDef, Umpire } from '@umpire/core'
import {
  fromStore,
  trackPreviousState,
  type FromStoreOptions,
  type UmpireStore,
} from '@umpire/store'

export type TanStackStoreSubscription =
  | {
      unsubscribe(): void
    }
  | (() => void)

export type TanStackStoreApi<S> = {
  state: S
  subscribe(listener: () => void): TanStackStoreSubscription
}

function normalizeSubscription(
  subscription: TanStackStoreSubscription,
): () => void {
  if (typeof subscription === 'function') {
    return subscription
  }

  return () => {
    subscription.unsubscribe()
  }
}

export function fromTanStackStore<
  S,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  store: TanStackStoreApi<S>,
  options: FromStoreOptions<S, C>,
): UmpireStore<F> {
  const previousState = trackPreviousState(store.state)

  return fromStore(
    ump,
    {
      getState: () => store.state,
      subscribe(listener) {
        return normalizeSubscription(
          store.subscribe(() => {
            const nextState = store.state

            listener(nextState, previousState.next(nextState))
          }),
        )
      },
    },
    options,
  )
}

export type { FromStoreOptions, UmpireStore } from '@umpire/store'
