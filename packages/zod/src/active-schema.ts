import type { z } from 'zod'
import type { AvailabilityMap, FieldDef } from '@umpire/core'

type FieldSchemas<F extends Record<string, FieldDef>> = Partial<
  Record<keyof F & string, z.ZodTypeAny>
>

export function activeSchema<F extends Record<string, FieldDef>>(
  availability: AvailabilityMap<F>,
  schemas: FieldSchemas<F>,
  zod: {
    object(shape: Record<string, z.ZodTypeAny>): z.ZodObject<Record<string, z.ZodTypeAny>>
  },
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [field, status] of Object.entries(availability) as Array<
    [keyof F & string, AvailabilityMap<F>[keyof F & string]]
  >) {
    if (!status.enabled) {
      continue
    }

    const base = schemas[field]
    if (!base) {
      continue
    }

    shape[field] = status.required ? base : base.optional()
  }

  return zod.object(shape)
}
