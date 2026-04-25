import { Effect, Fiber, Stream, SubscriptionRef } from 'effect'
import { fromStore, trackPreviousState } from '@umpire/store'
import type { FieldDef, Umpire } from '@umpire/core'
import type { FromStoreOptions, UmpireStore } from '@umpire/store'

export function fromSubscriptionRef<
  S,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  ref: SubscriptionRef.SubscriptionRef<S>,
  options: FromStoreOptions<S, C>,
): UmpireStore<F> {
  const getState = (): S => Effect.runSync(SubscriptionRef.get(ref))

  const subscribe = (listener: (next: S, prev: S) => void): (() => void) => {
    const tracker = trackPreviousState(getState())

    // ref.changes emits the current value immediately, then all subsequent
    // changes. Drop the first emission so the listener only fires on updates,
    // matching the contract that fromStore expects.
    const fiber = Effect.runFork(
      Stream.runForEach(Stream.drop(ref.changes, 1), (next) =>
        Effect.sync(() => {
          const prev = tracker.next(next)
          listener(next, prev)
        }),
      ),
    )

    return () => {
      Effect.runFork(Fiber.interrupt(fiber))
    }
  }

  return fromStore(ump, { getState, subscribe }, options)
}
