import type { Umpire, FieldDef } from '@umpire/core'

export type UmpireDynamicValidatorOptions<C> = {
  conditions?: C | ((formApi: unknown) => C)
  rejectFoul?: boolean
}

/**
 * Returns a validator function compatible with TanStack Form's
 * `form.options.validators.onDynamic` (i.e. `FormValidateOrFn`).
 *
 * Errors land in **`form.state.errorMap.onDynamic`**, NOT in
 * `field.state.meta.errors`.  This is a whole-form escape hatch,
 * not a per-field validator.
 */
export function umpireDynamicValidator<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  engine: Umpire<F, C>,
  options?: UmpireDynamicValidatorOptions<C>,
): (opts: {
  value: Record<string, unknown>
  formApi: unknown
}) => Record<string, string> | undefined {
  return ({ value, formApi }) => {
    const conditions =
      typeof options?.conditions === 'function'
        ? (options.conditions as (formApi: unknown) => C)(formApi)
        : options?.conditions

    const availability = engine.check(value, conditions as C | undefined)
    const errors: Record<string, string> = {}

    for (const [name, status] of Object.entries(
      availability as Record<
        string,
        {
          enabled?: boolean
          required?: boolean
          satisfied?: boolean
          fair?: boolean
          reason?: string | null
          error?: string
        }
      >,
    )) {
      if (!status.enabled) continue
      if (status.required && !status.satisfied) {
        errors[name] = status.reason ?? 'Required'
        continue
      }
      if (options?.rejectFoul !== false && status.fair === false) {
        errors[name] = status.reason ?? 'Invalid value'
        continue
      }
      if (status.error) {
        errors[name] = status.error
      }
    }

    return Object.keys(errors).length > 0 ? errors : undefined
  }
}
