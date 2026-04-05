import type { AvailabilityMap, FieldDef, Foul } from '@umpire/core'
import { formatUmpireDebugValue } from '../src/debugValue.js'

type TestFields = Record<'name' | 'email' | 'phone', FieldDef>

describe('formatUmpireDebugValue', () => {
  it('lists enabled, disabled, and foul field names', () => {
    const check: AvailabilityMap<TestFields> = {
      name: {
        enabled: true,
        fair: true,
        required: false,
        reason: null,
        reasons: [],
      },
      email: {
        enabled: true,
        fair: true,
        required: false,
        reason: null,
        reasons: [],
      },
      phone: {
        enabled: false,
        fair: true,
        required: false,
        reason: 'Name is required first',
        reasons: ['Name is required first'],
      },
    }

    const fouls: Foul<TestFields>[] = [
      {
        field: 'phone',
        reason: 'Phone should be cleared',
        suggestedValue: '',
      },
    ]

    expect(formatUmpireDebugValue({ check, fouls })).toEqual({
      enabled: ['name', 'email'],
      disabled: ['phone'],
      fouls: ['phone'],
    })
  })
})
