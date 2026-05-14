import type { FieldDef } from '@umpire/core'
import type { AnyValidationMap } from '@umpire/async'
import type { z } from 'zod'
import { assertFieldSchemas } from './schema-guards.js'

type FieldSchemas<F extends Record<string, FieldDef>> = Partial<
  Record<keyof F & string, z.ZodTypeAny>
>

export type AsyncZodAdapterOptions<F extends Record<string, FieldDef>> = {
  schemas: FieldSchemas<F>
}

export type AsyncZodAdapter<F extends Record<string, FieldDef>> = {
  validators: AnyValidationMap<F>
}

export function createZodAdapter<F extends Record<string, FieldDef>>(
  options: AsyncZodAdapterOptions<F>,
): AsyncZodAdapter<F> {
  assertFieldSchemas(options.schemas, 'createZodAdapter')
  return {
    validators: options.schemas as unknown as AnyValidationMap<F>,
  }
}
