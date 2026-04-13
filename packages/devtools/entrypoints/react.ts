import { useDebugValue, useEffect, useMemo, useRef } from 'react'
import type {
  AvailabilityMap,
  FieldDef,
  Foul,
  InputValues,
  Snapshot,
  Umpire,
} from '@umpire/core'
import { snapshotValue } from '@umpire/core/snapshot'
import type { RegisterOptions } from '../src/types.js'
import { register, unregister } from '../src/registry.js'

function formatUmpireDebugValue<
  F extends Record<string, FieldDef>,
>(value: {
  check: AvailabilityMap<F>
  fouls: Foul<F>[]
}) {
  const { check, fouls } = value

  return {
    disabled: Object.entries(check)
      .filter(([, availability]) => !availability.enabled)
      .map(([field]) => field),
    enabled: Object.entries(check)
      .filter(([, availability]) => availability.enabled)
      .map(([field]) => field),
    fouls: fouls.map((foul) => foul.field),
  }
}

export function useUmpireWithDevtools<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  ReadInput extends Record<string, unknown> = InputValues<F>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
>(
  id: string,
  ump: Umpire<F, C>,
  values: InputValues<F>,
  conditions?: C,
  options?: RegisterOptions<F, C, ReadInput, Reads>,
) {
  const prevRef = useRef<Snapshot<F, C> | undefined>(undefined)

  const check = useMemo(
    () => ump.check(values, conditions, prevRef.current?.values),
    [conditions, ump, values],
  )

  const fouls = useMemo(() => {
    const prev = prevRef.current

    if (!prev) {
      return []
    }

    return ump.play(prev, { values, conditions })
  }, [conditions, ump, values])

  prevRef.current = {
    values: snapshotValue(values),
    conditions: snapshotValue(conditions),
  }

  useDebugValue({ check, fouls }, formatUmpireDebugValue)

  // Register synchronously on every render — registry deduplicates by id.
  // useEffect would fire after paint, giving the panel stale values for the previous render.
  // Strict Mode / concurrent mode may call render multiple times before committing, causing
  // spurious panel updates, but register() is idempotent so this is harmless for a dev tool.
  // If React ever warns about this, useLayoutEffect is the correct upgrade path.
  register(id, ump, values, conditions, options)

  useEffect(() => () => {
    unregister(id)
  }, [id])

  return { check, fouls }
}

// Auto-assigns a stable numeric id per component instance.
// Drop-in replacement for useUmpire from @umpire/react — identical call signature.
// Use useUmpireWithDevtools instead if you need a named instance in the panel.
let nextId = 0

export function useUmpire<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
  ReadInput extends Record<string, unknown> = InputValues<F>,
  Reads extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  values: InputValues<F>,
  conditions?: C,
  options?: RegisterOptions<F, C, ReadInput, Reads>,
) {
  const idRef = useRef<string | null>(null)
  if (idRef.current === null) {
    idRef.current = `ump-${nextId++}`
  }

  return useUmpireWithDevtools(idRef.current, ump, values, conditions, options)
}
