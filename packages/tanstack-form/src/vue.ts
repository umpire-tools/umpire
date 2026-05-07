import { shallowRef, computed, watchEffect, defineComponent } from 'vue'
import type { PropType } from 'vue'
import { useStore } from '@tanstack/vue-form'
import type { Umpire, FieldDef, Foul, Snapshot } from '@umpire/core'
import { snapshotValue } from '@umpire/core/snapshot'
import type { UmpireFormField } from './adapter.js'

interface ValueContainer<T> {
  value: T
}
type Accessor<T> = ValueContainer<T> | (() => T) | T

type CreateUmpireFormOptions<C> = {
  conditions?: C | Accessor<C>
  strike?: boolean
}

type VueUmpireForm<F extends Record<string, FieldDef>> = {
  field(name: string): UmpireFormField
  fouls: Foul<F>[]
  applyStrike(): void
}

function resolveAccessor<T>(value: Accessor<T> | undefined): T | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'function') return (value as () => T)()
  if (typeof value === 'object' && 'value' in value) return value.value
  return value
}

export function useUmpireForm<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  form: { store: unknown; setFieldValue(name: string, value: unknown): void },
  engine: Umpire<F, C>,
  options?: CreateUmpireFormOptions<C>,
): VueUmpireForm<F> {
  const values = useStore(
    form.store as never,
    (state: unknown) => (state as { values: Record<string, unknown> }).values,
  )

  const conditions = computed(() => {
    return resolveAccessor(options?.conditions) as C | undefined
  })

  const availability = computed(() =>
    engine.check(values.value, conditions.value),
  )

  const fieldCache = new Map<string, UmpireFormField>()

  function field(name: string): UmpireFormField {
    let cached = fieldCache.get(name)
    if (cached) return cached

    cached = {
      get enabled() {
        return availability.value[name]?.enabled ?? false
      },
      get available() {
        return availability.value[name]?.enabled ?? false
      },
      get disabled() {
        return !(availability.value[name]?.enabled ?? false)
      },
      get required() {
        return availability.value[name]?.required ?? false
      },
      get satisfied() {
        return availability.value[name]?.satisfied ?? false
      },
      get fair() {
        return availability.value[name]?.fair ?? true
      },
      get reason() {
        return availability.value[name]?.reason ?? null
      },
      get reasons() {
        return availability.value[name]?.reasons ?? []
      },
      get error() {
        return availability.value[name]?.error
      },
    }
    fieldCache.set(name, cached)
    return cached
  }

  const previousSnapshot = shallowRef<Snapshot<C> | null>(null)
  const foulsRef = shallowRef<Foul<F>[]>([])

  watchEffect(() => {
    const current: Snapshot<C> = {
      values: snapshotValue(values.value),
      conditions: snapshotValue(conditions.value),
    }

    if (!previousSnapshot.value) {
      previousSnapshot.value = current
      return
    }

    const fouls = engine.play(previousSnapshot.value, current) as Foul<F>[]
    foulsRef.value = fouls
    previousSnapshot.value = current

    if (options?.strike) {
      for (const foul of fouls) {
        form.setFieldValue(foul.field, foul.suggestedValue)
      }
    }
  })

  return {
    field,
    get fouls() {
      return foulsRef.value
    },
    applyStrike() {
      for (const foul of foulsRef.value) {
        form.setFieldValue(foul.field, foul.suggestedValue)
      }
    },
  }
}

export const UmpireFormSubscribe = defineComponent({
  name: 'UmpireFormSubscribe',
  props: {
    form: {
      type: Object as PropType<{
        store: unknown
        setFieldValue(name: string, value: unknown): void
      }>,
      required: true,
    },
    engine: {
      type: Object as PropType<
        Umpire<Record<string, FieldDef>, Record<string, unknown>>
      >,
      required: true,
    },
    conditions: {
      type: [Object, Function] as PropType<
        Accessor<Record<string, unknown>> | undefined
      >,
      default: undefined,
    },
    strike: {
      type: Boolean as PropType<boolean | undefined>,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    const umpireForm = useUmpireForm(props.form, props.engine, {
      conditions: props.conditions,
      strike: props.strike,
    })

    return () => {
      if (slots.default) {
        return slots.default({ umpireForm })
      }
      return null
    }
  },
})
