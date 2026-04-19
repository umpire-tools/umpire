import { snapshotValue } from '@umpire/core/snapshot'

export function trackPreviousState<S>(initialState: S) {
  let previousState = snapshotValue(initialState)

  return {
    next(state: S): S {
      const nextPreviousState = previousState

      previousState = snapshotValue(state)

      return nextPreviousState
    },
  }
}
