import type { AvailabilityMap } from '@umpire/core'
import { z } from 'zod'
import { activeErrors, zodErrors } from '../src/active-errors.js'

type TestFields = {
  name: {}
  inviteCode: {}
  notes: {}
}

function createAvailability(
  overrides: Partial<AvailabilityMap<TestFields>> = {},
): AvailabilityMap<TestFields> {
  return {
    name: {
      enabled: true,
      required: true,
      reason: null,
      reasons: [],
    },
    inviteCode: {
      enabled: false,
      required: false,
      reason: 'invite only',
      reasons: ['invite only'],
    },
    notes: {
      enabled: true,
      required: false,
      reason: null,
      reasons: [],
    },
    ...overrides,
  }
}

describe('activeErrors', () => {
  test('filters out errors for disabled fields', () => {
    expect(
      activeErrors(createAvailability(), [
        { field: 'inviteCode', message: 'Invite code is invalid' },
        { field: 'name', message: 'Name is required' },
      ]),
    ).toEqual({
      name: 'Name is required',
    })
  })

  test('passes through errors for enabled fields', () => {
    expect(
      activeErrors(createAvailability(), [
        { field: 'name', message: 'Name is required' },
        { field: 'notes', message: 'Notes are too long' },
      ]),
    ).toEqual({
      name: 'Name is required',
      notes: 'Notes are too long',
    })
  })

  test('keeps the first error per field', () => {
    expect(
      activeErrors(createAvailability(), [
        { field: 'name', message: 'Name is required' },
        { field: 'name', message: 'Name must be at least 2 characters' },
      ]),
    ).toEqual({
      name: 'Name is required',
    })
  })

  test('normalizes Zod issues to field errors', () => {
    const result = z
      .object({
        name: z.string().min(1, 'Name is required'),
        notes: z.array(
          z.object({
            value: z.string().min(1, 'Value is required'),
          }),
        ),
      })
      .safeParse({
        name: '',
        notes: [{ value: '' }],
      })

    if (result.success) {
      throw new Error('Expected parse to fail')
    }

    expect(zodErrors(result.error)).toEqual([
      { field: 'name', message: 'Name is required' },
      { field: 'notes', message: 'Value is required' },
    ])
  })

  test('returns an empty object when no errors are provided', () => {
    expect(activeErrors(createAvailability(), [])).toEqual({})
  })
})
