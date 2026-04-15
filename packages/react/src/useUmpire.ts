import { useDebugValue, useMemo, useRef } from 'react'
import type {
  AvailabilityMap,
  FieldDef,
  InputValues,
  Foul,
  Snapshot,
  Umpire,
} from '@umpire/core'
import { snapshotValue } from '@umpire/core/snapshot'
import { formatUmpireDebugValue } from './debugValue.js'

export function useUmpire<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  values: InputValues,
  conditions?: C,
): {
  check: AvailabilityMap<F>
  fouls: Foul<F>[]
} {
  const prevRef = useRef<Snapshot<C> | undefined>(undefined)

  const check = useMemo(
    () => ump.check(values, conditions, prevRef.current?.values),
    [ump, values, conditions],
  )

  const fouls = useMemo(() => {
    const prev = prevRef.current
    if (!prev) {
      return []
    }
    return ump.play(prev, { values, conditions })
  }, [ump, values, conditions])

  // Update prev ref after computing check and fouls
  prevRef.current = {
    values: snapshotValue(values),
    conditions: snapshotValue(conditions),
  }

  useDebugValue({ check, fouls }, formatUmpireDebugValue)

  return { check, fouls }
}
