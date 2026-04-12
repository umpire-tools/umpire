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
    )

    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse({ optionalNickname: 'Doug' }).success).toBe(true)
  })

  test('returns an empty object schema for empty availability', () => {
    const schema = activeSchema({} as AvailabilityMap<EmptyFields>, {})

    expect(Object.keys(schema.shape)).toEqual([])
    expect(schema.safeParse({}).success).toBe(true)
  })

  test('skips enabled fields that do not have a matching schema', () => {
    const schema = activeSchema(
      createAvailability(),
      {
        requiredName: z.string(),
      },
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
    )).toThrow(
      'activeSchema() expects per-field schemas, not a z.object(). ' +
      'Pass formSchema.shape instead of formSchema.',
    )
  })
})

describe('activeSchema rejectFoul', () => {
  function createAvailabilityWithFoul(
    overrides: Partial<AvailabilityMap<TestFields>> = {},
  ): AvailabilityMap<TestFields> {
    return {
      requiredName: {
        enabled: true,
        fair: true,
        required: true,
        reason: null,
        reasons: [],
      },
      optionalNickname: {
        enabled: true,
        fair: true,
        required: false,
        reason: null,
        reasons: [],
      },
      disabledSecret: {
        enabled: false,
        fair: true,
        required: false,
        reason: 'disabled',
        reasons: ['disabled'],
      },
      missingSchema: {
        enabled: true,
        fair: true,
        required: true,
        reason: null,
        reasons: [],
      },
      ...overrides,
    }
  }

  test('rejects a foul field value when rejectFoul is true', () => {
    const schema = activeSchema(
      createAvailabilityWithFoul({
        optionalNickname: {
          enabled: true,
          fair: false,
          required: false,
          reason: 'Nickname is not valid for the current context',
          reasons: ['Nickname is not valid for the current context'],
        },
      }),
      { optionalNickname: z.string() },
      { rejectFoul: true },
    )

    const result = schema.safeParse({ optionalNickname: 'Doug' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Nickname is not valid for the current context',
      )
    }
  })

  test('uses a fallback message when reason is null', () => {
    const schema = activeSchema(
      createAvailabilityWithFoul({
        optionalNickname: {
          enabled: true,
          fair: false,
          required: false,
          reason: null,
          reasons: [],
        },
      }),
      { optionalNickname: z.string() },
      { rejectFoul: true },
    )

    const result = schema.safeParse({ optionalNickname: 'Doug' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Value is not valid for the current context',
      )
    }
  })

  test('passes through foul fields without error when rejectFoul is false', () => {
    const schema = activeSchema(
      createAvailabilityWithFoul({
        optionalNickname: {
          enabled: true,
          fair: false,
          required: false,
          reason: 'stale value',
          reasons: ['stale value'],
        },
      }),
      { optionalNickname: z.string() },
    )

    expect(schema.safeParse({ optionalNickname: 'Doug' }).success).toBe(true)
  })

  test('omitting a foul optional field passes when rejectFoul is true', () => {
    const schema = activeSchema(
      createAvailabilityWithFoul({
        optionalNickname: {
          enabled: true,
          fair: false,
          required: false,
          reason: 'stale value',
          reasons: ['stale value'],
        },
      }),
      { optionalNickname: z.string() },
      { rejectFoul: true },
    )

    // Clearing the field (absent from submission) should be accepted
    expect(schema.safeParse({}).success).toBe(true)
    // Submitting the stale value should be rejected
    expect(schema.safeParse({ optionalNickname: 'Doug' }).success).toBe(false)
  })

  test('fair fields are unaffected when rejectFoul is true', () => {
    const schema = activeSchema(
      createAvailabilityWithFoul(),
      { requiredName: z.string() },
      { rejectFoul: true },
    )

    expect(schema.safeParse({ requiredName: 'Douglas' }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false)
  })
})
