import { Stream, SubscriptionRef } from 'effect'
import type {
  AvailabilityMap,
  FieldDef,
  InputValues,
  Umpire,
} from '@umpire/core'
import type { FromStoreOptions } from '@umpire/store'

type AvailabilityStreamState<S> = {
  readonly state: S
  readonly prevValues: InputValues | undefined
}

export function availabilityStream<
  S,
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  ref: SubscriptionRef.SubscriptionRef<S>,
  options: FromStoreOptions<S, C>,
): Stream.Stream<AvailabilityMap<F>, never, never> {
  return SubscriptionRef.changes(ref).pipe(
    Stream.mapAccum(
      () => undefined as AvailabilityStreamState<S> | undefined,
      (prev, state) => {
        const values = options.select(state)
        const conditions = options.conditions?.(state)
        const availability = prev
          ? ump.check(values, conditions, prev.prevValues)
          : ump.check(values, conditions)

        return [{ state, prevValues: values }, [availability]]
      },
    ),
  )
}
