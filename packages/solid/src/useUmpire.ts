import { batch, createComputed, createSignal, type Accessor } from 'solid-js'
import type {
  AvailabilityMap,
  FieldDef,
  Foul,
  InputValues,
  Snapshot,
  Umpire,
} from '@umpire/core'
import { snapshotRecord } from './snapshot.js'

export function useUmpire<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  values: Accessor<InputValues<F>>,
  conditions?: Accessor<C>,
): {
  check: Accessor<AvailabilityMap<F>>
  fouls: Accessor<Foul<F>[]>
} {
  const [currentCheck, setCheck] = createSignal<AvailabilityMap<F>>()
  const [fouls, setFouls] = createSignal<Foul<F>[]>([])
  let previousSnapshot: Snapshot<F, C> | undefined

  createComputed(() => {
    const currentValues = snapshotRecord(values())
    const currentConditions = snapshotRecord(conditions?.())
    const nextCheck = ump.check(currentValues, currentConditions, previousSnapshot?.values)
    const nextFouls = previousSnapshot
      ? ump.play(previousSnapshot, { values: currentValues, conditions: currentConditions })
      : []

    batch(() => {
      setCheck(() => nextCheck)
      setFouls(() => nextFouls)
      previousSnapshot = {
        values: currentValues,
        conditions: currentConditions,
      }
    })
  })

  const check: Accessor<AvailabilityMap<F>> = () => currentCheck()!

  return { check, fouls }
}
