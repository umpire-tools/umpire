import type { Umpire, FieldDef } from '@umpire/core'
import { getUmpireLinkedFields } from './dependencies.js'

export type UmpireFieldValidatorOptions<C> = {
  conditions?: C | ((formApi: unknown) => C)
  events?: Array<'onChange' | 'onBlur' | 'onSubmit'>
  listenTo?: string[]
  rejectFoul?: boolean
}

export function umpireFieldValidator<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  engine: Umpire<F, C>,
  fieldName: string,
  options?: UmpireFieldValidatorOptions<C>,
): Record<string, unknown> {
  const validate = ({
    value: _value,
    fieldApi,
  }: {
    value: unknown
    fieldApi: { form: { state: { values: Record<string, unknown> } } }
  }) => {
    const conditions =
      typeof options?.conditions === 'function'
        ? (options.conditions as (formApi: unknown) => C)(fieldApi.form)
        : options?.conditions

    const availability = engine.check(
      fieldApi.form.state.values as Parameters<typeof engine.check>[0],
      conditions as C | undefined,
    )
    const fieldCheck = (
      availability as Record<
        string,
        { enabled?: boolean; fair?: boolean; reason?: string | null; error?: string }
      >
    )[fieldName]

    if (!fieldCheck?.enabled) return undefined
    if (options?.rejectFoul !== false && fieldCheck.fair === false) {
      return fieldCheck.reason ?? 'Invalid value'
    }
    if (fieldCheck.error) return fieldCheck.error

    return undefined
  }

  const listeners =
    options?.listenTo ?? getUmpireLinkedFields(engine, fieldName)
  const events = options?.events ?? ['onChange']

  const result: Record<string, unknown> = {}
  for (const event of events) {
    result[event] = validate
    result[`${event}ListenTo`] = listeners
  }
  return result
}

export function umpireFieldValidators<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  engine: Umpire<F, C>,
  options?: Omit<UmpireFieldValidatorOptions<C>, 'listenTo'>,
): Record<string, Record<string, unknown>> {
  const nodes = engine.graph().nodes
  const result: Record<string, Record<string, unknown>> = {}

  for (const fieldName of nodes) {
    result[fieldName] = umpireFieldValidator(engine, fieldName, {
      ...options,
    })
  }

  return result
}
