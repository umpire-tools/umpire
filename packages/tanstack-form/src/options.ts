import type { FieldDef, Umpire, Snapshot } from '@umpire/core'
import { snapshotValue } from '@umpire/core/snapshot'

export type UmpireFormOptionsConfig<C> = {
  conditions?: C | ((formApi: unknown) => C)
  strike?:
    | boolean
    | {
        events?: Array<'onChange' | 'onBlur'>
        debounceMs?: number
        mode?: 'suggestedValue' | 'resetField'
      }
}

/**
 * Produces TanStack Form option fragments for strike-on-transition behavior.
 *
 * Each call owns its own closure (previousSnapshot). If called inside a React
 * component, wrap in `useMemo` to avoid resetting the snapshot on every render.
 *
 * @example
 * ```ts
 * const form = useForm({
 *   defaultValues,
 *   ...createUmpireFormOptions(engine, { strike: true }),
 * })
 * ```
 */
export function createUmpireFormOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  engine: Umpire<F, C>,
  options?: UmpireFormOptionsConfig<C>,
): Record<string, unknown> {
  let previousSnapshot: Snapshot<C> | null = null

  if (!options?.strike) {
    return {}
  }

  const strikeConfig = typeof options.strike === 'object' ? options.strike : {}
  const events = strikeConfig.events ?? ['onChange']
  const useResetField = strikeConfig.mode === 'resetField'

  const listeners: Record<string, unknown> = {}

  for (const event of events) {
    listeners[event] = ({
      formApi,
    }: {
      formApi: {
        state: { values: Record<string, unknown> }
        setFieldValue(name: string, value: unknown): void
      }
    }) => {
      const conditions =
        typeof options?.conditions === 'function'
          ? (options.conditions as (formApi: unknown) => C)(formApi)
          : options?.conditions

      const currentSnapshot: Snapshot<C> = {
        values: snapshotValue(formApi.state.values),
        conditions: snapshotValue(conditions),
      }

      if (!previousSnapshot) {
        previousSnapshot = currentSnapshot
        return
      }

      const fouls = engine.play(previousSnapshot, currentSnapshot)
      previousSnapshot = currentSnapshot

      for (const foul of fouls) {
        if (useResetField) {
          ;(
            formApi as unknown as { resetField(name: string): void }
          ).resetField(foul.field)
        } else {
          formApi.setFieldValue(foul.field, foul.suggestedValue)
        }
      }
    }

    if (strikeConfig.debounceMs && strikeConfig.debounceMs > 0) {
      listeners[`${event}DebounceMs`] = strikeConfig.debounceMs
    }
  }

  return { listeners }
}
