import { useEffectEvent, useMemo, useState } from 'react'
import type { HintRuntime, HintRuntimeState } from './createHintRuntime.ts'

export function useHintRuntime<
  MarkerId extends string,
  HintId extends string,
>(
  runtime: HintRuntime<MarkerId, HintId>,
) {
  const [state, setState] = useState<HintRuntimeState<MarkerId, HintId>>(() => runtime.init())

  const rememberMarkers = useEffectEvent((next: Partial<Record<MarkerId, boolean>>) => {
    setState((current) => runtime.rememberMarkers(current, next))
  })

  const markHintShown = useEffectEvent((hintId: HintId) => {
    setState((current) => runtime.markHintShown(current, hintId))
  })

  const dismissHint = useEffectEvent((hintId: HintId) => {
    setState((current) => runtime.dismissHint(current, hintId))
  })

  return {
    dismissHint,
    hints: state.hints,
    markers: state.markers,
    markHintShown,
    rememberMarkers,
    state,
  }
}

export function useResolvedHints<
  MarkerId extends string,
  HintId extends string,
>(
  runtime: HintRuntime<MarkerId, HintId>,
  state: HintRuntimeState<MarkerId, HintId>,
  eligibility: Partial<Record<HintId, boolean>>,
) {
  return useMemo(
    () => runtime.resolveHints(state, eligibility),
    [eligibility, runtime, state],
  )
}
