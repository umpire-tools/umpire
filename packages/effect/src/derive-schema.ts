import { Schema } from 'effect'
import type { AvailabilityMap, FieldDef } from '@umpire/core'

export type AnyEffectSchema<A = unknown, R = never> = Schema.Decoder<A, R>

type SchemaOutput<S> = S extends AnyEffectSchema<infer A, unknown> ? A : never

export type ExtractR<Schemas extends Record<string, unknown>> = {
  [K in keyof Schemas]: Schemas[K] extends AnyEffectSchema<unknown, infer R>
    ? R
    : never
}[keyof Schemas]

export type InferBaseOutput<
  F extends Record<string, FieldDef>,
  Schemas extends FieldSchemas<F>,
> = Partial<{
  [K in keyof F & string as Schemas[K] extends AnyEffectSchema
    ? K
    : never]: SchemaOutput<Schemas[K]>
}>

export type FieldSchemas<F extends Record<string, FieldDef>> = Partial<
  Record<keyof F & string, AnyEffectSchema<unknown, unknown>>
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

// Effect v4 optional property signatures are also schemas, so Schema.Top covers
// both required fields and Schema.optional(...) entries in a struct shape.
type ShapeEntry = Schema.Top

export function deriveSchema<
  F extends Record<string, FieldDef>,
  Schemas extends FieldSchemas<F>,
>(
  availability: AvailabilityMap<F>,
  schemas: Schemas,
  options?: DeriveSchemaOptions,
): AnyEffectSchema<InferBaseOutput<F, Schemas>, ExtractR<Schemas>> {
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
      const rejected = base.check(Schema.makeFilter(() => message))
      shape[field] = status.required ? rejected : Schema.optional(rejected)
      continue
    }

    shape[field] = status.required ? base : Schema.optional(base)
  }

  return Schema.Struct(
    shape as Schema.Struct.Fields,
  ) as unknown as AnyEffectSchema<
    InferBaseOutput<F, Schemas>,
    ExtractR<Schemas>
  >
}
