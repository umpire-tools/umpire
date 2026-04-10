export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isZodObjectSchema(value: unknown): boolean {
  return isRecord(value) && ('_def' in value || '_zod' in value)
}

export function assertFieldSchemas(
  schemas: unknown,
  caller: 'activeSchema' | 'createZodValidation',
): asserts schemas is Record<string, unknown> {
  if (isZodObjectSchema(schemas)) {
    throw new Error(
      `[umpire/zod] ${caller}() expects per-field schemas, not a z.object(). ` +
      'Pass formSchema.shape instead of formSchema.',
    )
  }

  if (!isRecord(schemas)) {
    throw new Error(
      `[umpire/zod] ${caller}() expects a per-field schema map object.`,
    )
  }
}
