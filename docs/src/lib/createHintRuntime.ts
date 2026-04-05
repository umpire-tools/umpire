export type HintMarkers<K extends string> = Record<K, boolean>

export type HintState<K extends string> = Record<
  K,
  {
    dismissed: boolean
    shown: boolean
  }
>

export type HintRuntimeState<
  MarkerId extends string,
  HintId extends string,
> = {
  markers: HintMarkers<MarkerId>
  hints: HintState<HintId>
}

export type HintConfig<HintId extends string> = {
  id: HintId
  repeat?: boolean
}

export type HintResolution<HintId extends string> = {
  activeHint: HintId | null
  hints: Record<
    HintId,
    {
      active: boolean
      dismissed: boolean
      enabled: boolean
      shown: boolean
    }
  >
}

export type HintRuntime<
  MarkerId extends string,
  HintId extends string,
> = {
  dismissHint(
    current: HintRuntimeState<MarkerId, HintId>,
    hintId: HintId,
  ): HintRuntimeState<MarkerId, HintId>
  init(): HintRuntimeState<MarkerId, HintId>
  markHintShown(
    current: HintRuntimeState<MarkerId, HintId>,
    hintId: HintId,
  ): HintRuntimeState<MarkerId, HintId>
  rememberMarkers(
    current: HintRuntimeState<MarkerId, HintId>,
    next: Partial<Record<MarkerId, boolean>>,
  ): HintRuntimeState<MarkerId, HintId>
  resolveHints(
    current: HintRuntimeState<MarkerId, HintId>,
    eligibility: Partial<Record<HintId, boolean>>,
  ): HintResolution<HintId>
}

function orderedRecord<K extends string, V>(
  keys: readonly K[],
  createValue: (key: K) => V,
): Record<K, V> {
  return Object.fromEntries(keys.map((key) => [key, createValue(key)])) as Record<K, V>
}

export function createHintRuntime<
  MarkerId extends string,
  HintId extends string,
>(config: {
  markers: readonly MarkerId[]
  hints: readonly HintConfig<HintId>[]
}): HintRuntime<MarkerId, HintId> {
  const markerIds = [...config.markers]
  const hintIds = config.hints.map((hint) => hint.id)
  const hintConfig = Object.fromEntries(
    config.hints.map((hint) => [hint.id, hint]),
  ) as Record<HintId, HintConfig<HintId>>

  const markerSeed = orderedRecord(markerIds, () => false)
  const hintSeed = orderedRecord(hintIds, () => ({
    dismissed: false,
    shown: false,
  }))

  function isHintEnabled(
    state: HintRuntimeState<MarkerId, HintId>,
    eligibility: Partial<Record<HintId, boolean>>,
    hintId: HintId,
  ) {
    return Boolean(eligibility[hintId]) && !state.hints[hintId].dismissed
  }

  function shouldReappear(
    state: HintRuntimeState<MarkerId, HintId>,
    hintId: HintId,
  ) {
    return Boolean(hintConfig[hintId].repeat) || !state.hints[hintId].shown
  }

  function findNextHint(
    state: HintRuntimeState<MarkerId, HintId>,
    eligibility: Partial<Record<HintId, boolean>>,
  ): HintId | null {
    const eligibleHints = hintIds.filter((hintId) =>
      isHintEnabled(state, eligibility, hintId) &&
      shouldReappear(state, hintId),
    )

    return eligibleHints.at(-1) ?? null
  }

  return {
    init() {
      return {
        markers: { ...markerSeed },
        hints: { ...hintSeed },
      }
    },

    rememberMarkers(current, next) {
      let changed = false
      const markers = { ...current.markers }

      for (const markerId of markerIds) {
        if (Boolean(next[markerId]) && markers[markerId] !== true) {
          markers[markerId] = true
          changed = true
        }
      }

      return changed
        ? {
            ...current,
            markers,
          }
        : current
    },

    resolveHints(current, eligibility) {
      const activeHint = findNextHint(current, eligibility)

      return {
        activeHint,
        hints: orderedRecord(hintIds, (hintId) => ({
          active: hintId === activeHint,
          dismissed: current.hints[hintId].dismissed,
          enabled: Boolean(eligibility[hintId]),
          shown: current.hints[hintId].shown,
        })),
      }
    },

    markHintShown(current, hintId) {
      if (current.hints[hintId].shown) {
        return current
      }

      return {
        ...current,
        hints: {
          ...current.hints,
          [hintId]: {
            ...current.hints[hintId],
            shown: true,
          },
        },
      }
    },

    dismissHint(current, hintId) {
      if (current.hints[hintId].dismissed) {
        return current
      }

      return {
        ...current,
        hints: {
          ...current.hints,
          [hintId]: {
            ...current.hints[hintId],
            dismissed: true,
          },
        },
      }
    },
  }
}
