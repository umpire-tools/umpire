import type { z } from 'zod'
import type { AvailabilityMap, FieldDef } from '@umpire/core'
import { assertFieldSchemas } from './schema-guards.js'

type FieldSchemas<F extends Record<string, FieldDef>> = Partial<
  Record<keyof F & string, z.ZodTypeAny>
>

/**
 * Pass per-field schemas directly, or use `yourSchema.shape` to extract
 * them from an existing `z.object()`.
 *
 * ```ts
 * // Per-field
 * activeSchema(availability, { email: z.string().email() }, z)
 *
 * // From an existing z.object()
 * activeSchema(availability, formSchema.shape, z)
 * ```
 */
export function activeSchema<F extends Record<string, FieldDef>>(
  availability: AvailabilityMap<F>,
  schemas: FieldSchemas<F>,
  zod: {
    object(shape: Record<string, z.ZodTypeAny>): z.ZodObject<Record<string, z.ZodTypeAny>>
  },
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  assertFieldSchemas(schemas, 'activeSchema')

  const fieldSchemas = schemas

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

    shape[field] = status.required ? base : base.optional()
  }

  return zod.object(shape)
}
