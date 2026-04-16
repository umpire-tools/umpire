import { z } from 'zod'
import { oneOf, type Rule, type FieldDef } from '@umpire/core'

type DiscriminatedUnionOption = z.ZodObject<z.ZodRawShape>

type ExtractedBranches = {
  discriminator: string
  branches: Record<string, string[]>
  fieldDefs: Record<string, { required: boolean }>
}

export type DeriveOptions = {
  groupName: string
  exclude?: string[]
  branchNames?: Record<string, string>
}

function extractBranches(
  schema: z.ZodDiscriminatedUnion<string, DiscriminatedUnionOption[]>,
  options: {
    exclude?: string[]
    branchNames?: Record<string, string>
    forceRequired?: boolean
  } = {},
): ExtractedBranches {
  const discriminator: string =
    'discriminator' in schema
      ? (schema as any).discriminator
      : (schema as any)._zod.def.discriminator
  const excludeSet = new Set([discriminator, ...(options.exclude ?? [])])

  const branches: Record<string, string[]> = {}
  const fieldDefs: Record<string, { required: boolean }> = {}

  // Discriminator field
  fieldDefs[discriminator] = { required: true }

  for (const variant of schema.options) {
    const shape = variant.shape
    const literalField = shape[discriminator] as any
    const rawValue: string = literalField._def?.value ?? literalField.value
    const branchName = options.branchNames?.[rawValue] ?? rawValue
    const branchFields: string[] = []

    for (const [key, zodType] of Object.entries(shape)) {
      if (excludeSet.has(key)) continue

      branchFields.push(key)

      if (!(key in fieldDefs)) {
        fieldDefs[key] = {
          required: options.forceRequired ?? !zodType.isOptional(),
        }
      }
    }

    branches[branchName] = branchFields
  }

  return { discriminator, branches, fieldDefs }
}

/**
 * Derive a oneOf rule from a Zod discriminated union.
 */
export function deriveOneOf<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  schema: z.ZodDiscriminatedUnion<string, DiscriminatedUnionOption[]>,
  options: DeriveOptions,
): Rule<F, C> {
  const { discriminator, branches } = extractBranches(schema, options)
  const branchNames = options.branchNames
  return oneOf<F, C>(options.groupName, branches, {
    activeBranch: (values) => {
      const raw = values[discriminator as keyof F] as string | null | undefined
      if (raw == null) return null
      return branchNames?.[raw] ?? raw
    },
  })
}

/**
 * Derive fields AND oneOf rule together.
 */
export function deriveDiscriminatedFields<
  T extends z.ZodDiscriminatedUnion<string, DiscriminatedUnionOption[]>,
>(
  schema: T,
  options: DeriveOptions & { required?: boolean },
): {
  fields: Record<string, FieldDef>
  rule: Rule<Record<string, FieldDef>, Record<string, unknown>>
} {
  const { discriminator, branches, fieldDefs } = extractBranches(schema, {
    ...options,
    forceRequired: options.required,
  })
  const branchNames = options.branchNames

  return {
    fields: fieldDefs,
    rule: oneOf(options.groupName, branches, {
      activeBranch: (values) => {
        const raw = values[discriminator as keyof typeof values] as string | null | undefined
        if (raw == null) return null
        return branchNames?.[raw] ?? raw
      },
    }),
  }
}
