import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react'
import type { ReactNode } from 'react'
import { useStore, createFormHookContexts } from '@tanstack/react-form'
import { useUmpire } from '@umpire/react'
import type { Umpire, FieldDef, Foul, AvailabilityMap } from '@umpire/core'
import { umpireFieldValidators } from './validator.js'
import type { UmpireFormField } from './adapter.js'

// --- Types ---

export type UmpireForm<F extends Record<string, FieldDef>> = {
  field(name: string): UmpireFormField
  fouls: Foul<F>[]
  applyStrike(): void
}

type UseUmpireFormOptions<C> = {
  conditions?: C | (() => C)
  strike?: boolean
}

// --- Helpers ---

const defaultField: UmpireFormField = {
  enabled: true,
  available: true,
  disabled: false,
  required: false,
  satisfied: true,
  fair: true,
  reason: null,
  reasons: [],
}

function buildFieldProxy(
  check: AvailabilityMap<Record<string, FieldDef>> | undefined,
): (name: string) => UmpireFormField {
  const fieldCache = new Map<string, UmpireFormField>()

  return function field(name: string): UmpireFormField {
    const cached = fieldCache.get(name)
    if (cached) return cached

    const proxy: UmpireFormField = {
      get enabled() {
        return check?.[name]?.enabled ?? false
      },
      get available() {
        return check?.[name]?.enabled ?? false
      },
      get disabled() {
        return !(check?.[name]?.enabled ?? false)
      },
      get required() {
        return check?.[name]?.required ?? false
      },
      get satisfied() {
        return check?.[name]?.satisfied ?? false
      },
      get fair() {
        return check?.[name]?.fair ?? true
      },
      get reason() {
        return check?.[name]?.reason ?? null
      },
      get reasons() {
        return check?.[name]?.reasons ?? []
      },
      get error() {
        return check?.[name]?.error
      },
    }
    fieldCache.set(name, proxy)
    return proxy
  }
}

function resolveConditions<C>(input: C | (() => C) | undefined): C | undefined {
  if (typeof input === 'function') {
    return (input as () => C)()
  }
  return input
}

// --- Hook ---

export function useUmpireForm<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  form: { store: unknown; setFieldValue(name: string, value: unknown): void },
  engine: Umpire<F, C>,
  options?: UseUmpireFormOptions<C>,
): UmpireForm<F> {
  const values = useStore(
    form.store as never,
    (state: { values: Record<string, unknown> }) => state.values,
  ) as Record<string, unknown>
  const conditions = resolveConditions(options?.conditions)

  const { check, fouls } = useUmpire(engine, values, conditions)

  const applyStrike = useCallback(() => {
    for (const foul of fouls) {
      form.setFieldValue(foul.field, foul.suggestedValue)
    }
  }, [form, fouls])

  useEffect(() => {
    if (options?.strike && fouls.length > 0) {
      applyStrike()
    }
  }, [applyStrike, fouls, options?.strike])

  const umpireForm = useMemo(
    () => ({
      field: buildFieldProxy(check),
      fouls,
      applyStrike,
    }),
    [check, fouls, applyStrike],
  )

  return umpireForm
}

// --- Subscribe render-prop ---

type UmpireFormSubscribeProps<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  form: {
    Subscribe(props: {
      selector(state: { values: Record<string, unknown> }): Record<
        string,
        unknown
      >
      children(values: Record<string, unknown>): ReactNode
    }): ReactNode
    setFieldValue(name: string, value: unknown): void
  }
  engine: Umpire<F, C>
  conditions?: C | (() => C)
  strike?: boolean
  children: (umpireForm: UmpireForm<F>) => ReactNode
}

export function UmpireFormSubscribe<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(props: UmpireFormSubscribeProps<F, C>) {
  const Subscribe = props.form.Subscribe

  return (
    <Subscribe
      selector={(state: { values: Record<string, unknown> }) => state.values}
      children={(values: Record<string, unknown>) => (
        <UmpireFormSnapshot
          form={props.form}
          engine={props.engine}
          values={values}
          conditions={props.conditions}
          strike={props.strike}
        >
          {props.children}
        </UmpireFormSnapshot>
      )}
    />
  )
}

function UmpireFormSnapshot<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>({
  form,
  engine,
  values,
  conditions: conditionsInput,
  strike,
  children,
}: {
  form: { setFieldValue(name: string, value: unknown): void }
  engine: Umpire<F, C>
  values: Record<string, unknown>
  conditions?: C | (() => C)
  strike?: boolean
  children: (umpireForm: UmpireForm<F>) => ReactNode
}) {
  const conditions = resolveConditions(conditionsInput)

  const { check, fouls } = useUmpire(engine, values, conditions)

  const applyStrike = useCallback(() => {
    for (const foul of fouls) {
      form.setFieldValue(foul.field, foul.suggestedValue)
    }
  }, [form, fouls])

  useEffect(() => {
    if (strike && fouls.length > 0) {
      applyStrike()
    }
  }, [applyStrike, fouls, strike])

  const umpireForm = useMemo(
    () => ({
      field: buildFieldProxy(check),
      fouls,
      applyStrike,
    }),
    [check, fouls, applyStrike],
  )

  return <>{children(umpireForm)}</>
}

// --- Context-based components ---

const { useFormContext } = createFormHookContexts()
type UmpireFormContextValue = {
  field(name: string): UmpireFormField
  fouls: Array<{ field: string }>
  applyStrike(): void
}

const UmpireFormContext = createContext<{
  umpireForm: UmpireFormContextValue | null
}>({ umpireForm: null })

type TanStackReactForm = {
  store: unknown
  setFieldValue(name: string, value: unknown): void
  Field(props: {
    name: string
    validators?: Record<string, unknown>
    children(field: unknown): ReactNode
  }): ReactNode
  Subscribe(props: {
    selector(state: { isSubmitting: boolean }): boolean
    children(isSubmitting: boolean): ReactNode
  }): ReactNode
}

type CreateUmpireFormComponentsOptions<C> = {
  conditions?: C | ((form: unknown) => C)
  strike?: boolean
}

export function createUmpireFormComponents<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(engine: Umpire<F, C>, options?: CreateUmpireFormComponentsOptions<C>) {
  const autoValidators = umpireFieldValidators(engine)

  function UmpireScope({ children }: { children: ReactNode }) {
    const form = useFormContext()
    const resolvedConditions =
      typeof options?.conditions === 'function'
        ? (options.conditions as (form: unknown) => C)(form)
        : options?.conditions

    const umpireForm = useUmpireForm(form as TanStackReactForm, engine, {
      conditions: resolvedConditions,
      strike: options?.strike,
    })

    return createElement(
      UmpireFormContext.Provider,
      { value: { umpireForm } },
      children,
    )
  }

  function UmpireField<Name extends string>({
    name,
    validators,
    children,
  }: {
    name: Name
    validators?: Record<string, unknown>
    children: (field: unknown, availability: UmpireFormField) => ReactNode
  }) {
    const { umpireForm } = useContext(UmpireFormContext)
    const form = useFormContext()
    const availability = umpireForm?.field(name) ?? defaultField

    if (!availability.enabled) return null

    const finalValidators = validators ?? autoValidators[name]

    const Field = (form as TanStackReactForm).Field

    return (
      <Field name={name} validators={finalValidators}>
        {(field: unknown) => children(field, availability)}
      </Field>
    )
  }

  function UmpireSubmit({
    label,
    disabled,
  }: {
    label: string
    disabled?: boolean
  }) {
    const form = useFormContext()
    const { umpireForm } = useContext(UmpireFormContext)
    const Subscribe = (form as TanStackReactForm).Subscribe

    return (
      <Subscribe
        selector={(state: { isSubmitting: boolean }) => state.isSubmitting}
        children={(isSubmitting: boolean) => (
          <button
            type="submit"
            disabled={
              disabled || isSubmitting || (umpireForm?.fouls.length ?? 0) > 0
            }
          >
            {label}
          </button>
        )}
      />
    )
  }

  return { UmpireScope, UmpireField, UmpireSubmit } as const
}
