import type { AvailabilityMap } from '@umpire/core'
import { z } from 'zod'
import { activeSchema } from '../src/active-schema.js'

type TestFields = {
  requiredName: {}
  optionalNickname: {}
  disabledSecret: {}
  missingSchema: {}
}

type EmptyFields = {}

function createAvailability(
  overrides: Partial<AvailabilityMap<TestFields>> = {},
): AvailabilityMap<TestFields> {
  return {
    requiredName: {
      enabled: true,
      required: true,
      reason: null,
      reasons: [],
    },
    optionalNickname: {
      enabled: true,
      required: false,
      reason: null,
      reasons: [],
    },
    disabledSecret: {
      enabled: false,
      required: false,
      reason: 'disabled',
      reasons: ['disabled'],
    },
    missingSchema: {
      enabled: true,
      required: true,
      reason: null,
      reasons: [],
    },
    ...overrides,
  }
}

describe('activeSchema', () => {
  test('omits disabled fields from the schema', () => {
    const schema = activeSchema(
      createAvailability(),
      {
        requiredName: z.string(),
        disabledSecret: z.string(),
      },
      z,
    )

    expect(Object.keys(schema.shape)).toEqual(['requiredName'])
    expect(schema.shape.disabledSecret).toBeUndefined()
  })

  test('keeps enabled required fields required', () => {
    const schema = activeSchema(
      createAvailability(),
      {
        requiredName: z.string(),
      },
      z,
    )

    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse({ requiredName: 'Douglas' }).success).toBe(true)
  })

  test('makes enabled non-required fields optional', () => {
    const schema = activeSchema(
      createAvailability(),
      {
        optionalNickname: z.string(),
      },
      z,
    )

    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse({ optionalNickname: 'Doug' }).success).toBe(true)
  })

  test('returns an empty object schema for empty availability', () => {
    const schema = activeSchema({} as AvailabilityMap<EmptyFields>, {}, z)

    expect(Object.keys(schema.shape)).toEqual([])
    expect(schema.safeParse({}).success).toBe(true)
  })

  test('skips enabled fields that do not have a matching schema', () => {
    const schema = activeSchema(
      createAvailability(),
      {
        requiredName: z.string(),
      },
      z,
    )

    expect(schema.shape.missingSchema).toBeUndefined()
    expect(Object.keys(schema.shape)).toEqual(['requiredName'])
  })

  test('throws if given a z.object instead of per-field schemas', () => {
    expect(() => activeSchema(
      createAvailability(),
      z.object({
        requiredName: z.string(),
      }) as never,
      z,
    )).toThrow(
      '[@umpire/zod] activeSchema() expects per-field schemas, not a z.object(). ' +
      'Pass formSchema.shape instead of formSchema.',
    )
  })
})
