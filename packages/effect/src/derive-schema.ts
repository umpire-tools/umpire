import { Schema } from 'effect'
import type { AvailabilityMap, FieldDef } from '@umpire/core'

export type AnyEffectSchema = Schema.Schema<unknown, unknown, never>

export type FieldSchemas<F extends Record<string, FieldDef>> = Partial<
  Record<keyof F & string, AnyEffectSchema>
>

export type DeriveSchemaOptions = {
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

// Schema.optional() returns a PropertySignature, not a Schema — both are valid
// as struct field entries.
type ShapeEntry = Schema.Schema.All | Schema.PropertySignature.All

export function deriveSchema<F extends Record<string, FieldDef>>(
  availability: AvailabilityMap<F>,
  schemas: FieldSchemas<F>,
  options?: DeriveSchemaOptions,
): Schema.Schema.AnyNoContext {
  const rejectFoul = options?.rejectFoul ?? false
  const shape: Record<string, ShapeEntry> = {}

  for (const [field, status] of Object.entries(availability) as Array<
    [keyof F & string, AvailabilityMap<F>[keyof F & string]]
  >) {
    if (!status.enabled) continue

    const base = schemas[field]
    if (!base) continue

    if (rejectFoul && !status.fair) {
      const message =
        status.reason ?? 'Value is not valid for the current context'
      const rejected = base.pipe(
        Schema.filter(() => false, { message: () => message }),
      )
      shape[field] = status.required ? rejected : Schema.optional(rejected)
      continue
    }

    shape[field] = status.required ? base : Schema.optional(base)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Schema.Struct(shape as any) as unknown as Schema.Schema.AnyNoContext
}
