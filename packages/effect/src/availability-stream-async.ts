import { Effect, Stream, SubscriptionRef } from 'effect'
import type { AvailabilityMap, FieldDef, InputValues } from '@umpire/core'
import type { Umpire as AsyncUmpire } from '@umpire/async'
import type { FromStoreOptions } from '@umpire/store'

type AsyncAvailabilityStreamState = {
  readonly prevValues: InputValues | undefined
}

export function availabilityStreamAsync<
  S,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: AsyncUmpire<F, C>,
  ref: SubscriptionRef.SubscriptionRef<S>,
  options: FromStoreOptions<S, C>,
): Stream.Stream<AvailabilityMap<F>, unknown, never> {
  return SubscriptionRef.changes(ref).pipe(
    Stream.mapAccumEffect(
      () => undefined as AsyncAvailabilityStreamState | undefined,
      (prev, state) =>
        Effect.gen(function* () {
          const values = options.select(state)
          const conditions = options.conditions?.(state)

          const availability = yield* Effect.tryPromise({
            try: (signal) =>
              prev
                ? ump.check(values, conditions, prev.prevValues, signal)
                : ump.check(values, conditions, undefined, signal),
            catch: (error) => error,
          })

          // Effect v4 Stream.mapAccumEffect emits from an iterable, so wrap
          // the single availability snapshot in a one-item array.
          return [{ prevValues: values }, [availability]] as const
        }),
    ),
  )
}
