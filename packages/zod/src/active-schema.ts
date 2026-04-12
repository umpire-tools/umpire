import { z } from 'zod'
import type { AvailabilityMap, FieldDef } from '@umpire/core'
import { assertFieldSchemas } from './schema-guards.js'

type FieldSchemas<F extends Record<string, FieldDef>> = Partial<
  Record<keyof F & string, z.ZodTypeAny>
>

export type ActiveSchemaOptions = {
  /**
   * When true, enabled fields whose value is foul (`fair: false`) are
   * included in the schema with a refinement that always fails, using the
   * field's `reason` as the error message. Use this on the server to reject
   * submissions that contain contextually invalid values rather than
   * silently accepting them.
   *
   * Defaults to false (foul fields pass through with their base schema).
   */
  rejectFoul?: boolean
}

/**
 * Pass per-field schemas directly, or use `yourSchema.shape` to extract
 * them from an existing `z.object()`.
 *
 * ```ts
 * // Per-field
 * activeSchema(availability, { email: z.string().email() })
 *
 * // From an existing z.object()
 * activeSchema(availability, formSchema.shape)
 *
 * // Server guard — reject foul values outright
 * activeSchema(availability, schemas, { rejectFoul: true })
 * ```
 */
export function activeSchema<F extends Record<string, FieldDef>>(
  availability: AvailabilityMap<F>,
  schemas: FieldSchemas<F>,
  options?: ActiveSchemaOptions,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  assertFieldSchemas(schemas, 'activeSchema')

  const fieldSchemas = schemas
  const rejectFoul = options?.rejectFoul ?? false

  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [field, status] of Object.entries(availability) as Array<
    [keyof F & string, AvailabilityMap<F>[keyof F & string]]
  >) {
    if (!status.enabled) {
      continue
    }

    const base = fieldSchemas[field]
    if (!base) {
      continue
    }

    if (rejectFoul && !status.fair) {
      const message = status.reason ?? 'Value is not valid for the current context'
      const refined = base.refine(() => false, { message })
      shape[field] = status.required ? refined : refined.optional()
      continue
    }

    shape[field] = status.required ? base : base.optional()
  }

  return z.object(shape)
}
