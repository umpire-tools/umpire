/** @jsxImportSource solid-js */
import {
  createContext,
  createEffect,
  createMemo,
  on,
  Show,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js'
import { createComponent, createDynamic } from 'solid-js/web'
import { createFormHookContexts } from '@tanstack/solid-form'
import type { FieldDef, Foul, Umpire, AvailabilityMap } from '@umpire/core'
import { useUmpire } from '@umpire/solid'
import { umpireFieldValidators } from './validator.js'
import type { UmpireFormField } from './adapter.js'
import { formStrike, formStrikeDisabled } from './strikes.js'

type SolidUmpireForm<F extends Record<string, FieldDef>> = {
  field(name: string): UmpireFormField
  fouls: Foul<F>[]
  applyStrike(): void
}

type CreateUmpireFormOptions<C> = {
  conditions?: C | Accessor<C>
  strike?: boolean
}

type CreateUmpireFormComponentsOptions<C> = {
  conditions?: C | ((form: unknown) => C)
  strike?: boolean
}

function getDefaultFieldStatus(): UmpireFormField {
  return {
    enabled: false,
    available: false,
    disabled: true,
    required: false,
    satisfied: false,
    fair: true,
    reason: null,
    reasons: [],
  }
}

function buildSolidUmpireForm<F extends Record<string, FieldDef>>(
  check: Accessor<AvailabilityMap<F>>,
  fouls: Accessor<Foul<F>[]>,
  onApplyStrike: () => void,
): SolidUmpireForm<F> {
  const fieldCache = new Map<string, UmpireFormField>()

  return {
    field(name: string): UmpireFormField {
      let cached = fieldCache.get(name)
      if (cached) return cached

      cached = {
        get enabled() {
          return check()[name]?.enabled ?? false
        },
        get available() {
          return check()[name]?.enabled ?? false
        },
        get disabled() {
          return !(check()[name]?.enabled ?? false)
        },
        get required() {
          return check()[name]?.required ?? false
        },
        get satisfied() {
          return check()[name]?.satisfied ?? false
        },
        get fair() {
          return check()[name]?.fair ?? true
        },
        get reason() {
          return check()[name]?.reason ?? null
        },
        get reasons() {
          return check()[name]?.reasons ?? []
        },
        get error() {
          return check()[name]?.error
        },
      }
      fieldCache.set(name, cached)
      return cached
    },
    get fouls() {
      return fouls()
    },
    applyStrike: onApplyStrike,
  }
}

function resolveConditions<C>(
  raw: C | Accessor<C> | undefined,
): Accessor<C> | undefined {
  if (raw === undefined) return undefined
  return typeof raw === 'function' ? (raw as Accessor<C>) : () => raw as C
}

export function createUmpireForm<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  form: {
    useStore<T>(
      selector: (state: { values: Record<string, unknown> }) => T,
    ): Accessor<T>
    setFieldValue(name: string, value: unknown): void
  },
  engine: Umpire<F, C>,
  options?: CreateUmpireFormOptions<C>,
): SolidUmpireForm<F> {
  const values = form.useStore((state) => state.values)

  const conditions = resolveConditions(options?.conditions)
  const { check, fouls } = useUmpire(engine, values, conditions)
  const setFieldValue = form.setFieldValue

  const applyStrikeFn = () => {
    formStrike(fouls(), setFieldValue)
  }

  createEffect(
    on(fouls, () => {
      if (options?.strike && fouls().length > 0) {
        formStrikeDisabled(fouls(), check(), setFieldValue)
      }
    }),
  )

  return buildSolidUmpireForm(check, fouls, applyStrikeFn)
}

type UmpireFormSubscribeProps<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  form: {
    Subscribe(props: {
      selector(state: {
        values: Record<string, unknown>
      }): Record<string, unknown>
      children(values: Accessor<Record<string, unknown>>): JSX.Element
    }): JSX.Element
    useStore<T>(
      selector: (state: { values: Record<string, unknown> }) => T,
    ): Accessor<T>
    setFieldValue(name: string, value: unknown): void
  }
  engine: Umpire<F, C>
  conditions?: C | Accessor<C>
  strike?: boolean
  children: (umpireForm: SolidUmpireForm<F>) => JSX.Element
}

function buildUmpireFormFromValues<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  form: { setFieldValue(name: string, value: unknown): void },
  engine: Umpire<F, C>,
  values: () => Record<string, unknown>,
  conditionsInput: C | Accessor<C> | undefined,
  strike: boolean | undefined,
): SolidUmpireForm<F> {
  const conditions = resolveConditions(conditionsInput)
  const { check, fouls } = useUmpire(engine, values, conditions)
  const setFieldValue = form.setFieldValue

  const applyStrikeFn = () => {
    formStrike(fouls(), setFieldValue)
  }

  createEffect(
    on(fouls, () => {
      if (strike && fouls().length > 0) {
        formStrikeDisabled(fouls(), check(), setFieldValue)
      }
    }),
  )

  return buildSolidUmpireForm(check, fouls, applyStrikeFn)
}

export function UmpireFormSubscribe<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(props: UmpireFormSubscribeProps<F, C>): JSX.Element {
  return props.form.Subscribe({
    selector: (state: { values: Record<string, unknown> }) => state.values,
    children: (values: Accessor<Record<string, unknown>>) => {
      const umpireForm = buildUmpireFormFromValues(
        props.form,
        props.engine,
        values,
        props.conditions,
        props.strike,
      )
      return props.children(umpireForm)
    },
  })
}

export const UmpireFormContext = createContext<
  () => {
    field(name: string): UmpireFormField
    fouls: Array<{ field: string }>
    applyStrike(): void
  }
>(() => ({
  field: () => ({
    enabled: true,
    available: true,
    disabled: false,
    required: false,
    satisfied: true,
    fair: true,
    reason: null,
    reasons: [],
  }),
  fouls: [],
  applyStrike: () => {},
}))

const { useFormContext } = createFormHookContexts()

type TanStackSolidForm = {
  useStore<T>(
    selector: (state: {
      values: Record<string, unknown>
      isSubmitting: boolean
    }) => T,
  ): Accessor<T>
  setFieldValue(name: string, value: unknown): void
  Field(props: {
    name: string
    validators?: Record<string, unknown>
    children(field: Accessor<unknown>): JSX.Element
  }): JSX.Element
}

type BooleanShow = (props: {
  when: boolean
  children: JSX.Element
}) => JSX.Element

function useOptionalFormContext(): TanStackSolidForm | null {
  try {
    return useFormContext() as TanStackSolidForm
  } catch {
    return null
  }
}

export function createUmpireFormComponents<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(engine: Umpire<F, C>, options?: CreateUmpireFormComponentsOptions<C>) {
  const autoValidators = umpireFieldValidators(engine)

  function UmpireScope(props: { children: JSX.Element }): JSX.Element {
    const form = useFormContext()
    const resolvedConditions =
      typeof options?.conditions === 'function'
        ? (options.conditions as (form: unknown) => C)(form)
        : options?.conditions
    const umpireForm = createUmpireForm(form as TanStackSolidForm, engine, {
      conditions: resolvedConditions,
      strike: options?.strike,
    })
    const getUmpireForm = () => umpireForm

    return createComponent(UmpireFormContext.Provider, {
      value: getUmpireForm,
      get children() {
        return props.children
      },
    })
  }

  function UmpireField<Name extends string>(props: {
    name: Name
    validators?: Record<string, unknown>
    children: (
      field: Accessor<unknown>,
      availability: UmpireFormField,
    ) => JSX.Element
  }): JSX.Element {
    const getUmpireForm = useContext(UmpireFormContext)
    const form = useOptionalFormContext()
    const avail = createMemo(() => {
      return getUmpireForm()?.field(props.name) ?? getDefaultFieldStatus()
    })
    const finalValidators = createMemo(
      () => props.validators ?? autoValidators[props.name],
    )

    return createComponent(Show as unknown as BooleanShow, {
      get when() {
        return avail().enabled
      },
      get children() {
        if (!form?.Field) {
          return props.children(() => ({}), avail())
        }

        return form.Field({
          name: props.name,
          validators: finalValidators(),
          children: (field: Accessor<unknown>) =>
            props.children(field, avail()),
        })
      },
    })
  }

  function UmpireSubmit(props: {
    label: string
    disabled?: boolean
  }): JSX.Element {
    const getUmpireForm = useContext(UmpireFormContext)
    const form = useOptionalFormContext()
    const isSubmitting =
      form?.useStore((state) => state.isSubmitting) ?? (() => false)
    const disabled = createMemo(
      () =>
        props.disabled ||
        isSubmitting() ||
        (getUmpireForm()?.fouls.length ?? 0) > 0,
    )

    return createDynamic(() => 'button', {
      type: 'submit',
      get disabled() {
        return disabled()
      },
      get children() {
        return props.label
      },
    })
  }

  return { UmpireScope, UmpireField, UmpireSubmit } as const
}
