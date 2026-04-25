import type { Foul } from '../src/types.js'
import { foulMap } from '../src/index.js'

type TestFields = {
  email: {}
  plan: {}
  notes: {}
}

describe('foulMap', () => {
  test('indexes fouls by field', () => {
    const scenarios: Array<{
      fouls: Foul<TestFields>[]
      expected: Partial<Record<keyof TestFields, Foul<TestFields>>>
    }> = [
      {
        fouls: [],
        expected: {},
      },
      {
        fouls: [
          {
            field: 'email',
            reason: 'required',
            suggestedValue: undefined,
          },
        ],
        expected: {
          email: {
            field: 'email',
            reason: 'required',
            suggestedValue: undefined,
          },
        },
      },
      {
        fouls: [
          {
            field: 'email',
            reason: 'required',
            suggestedValue: undefined,
          },
          {
            field: 'plan',
            reason: 'plan unavailable',
            suggestedValue: 'basic',
          },
          {
            field: 'notes',
            reason: 'disabled',
            suggestedValue: '',
          },
        ],
        expected: {
          email: {
            field: 'email',
            reason: 'required',
            suggestedValue: undefined,
          },
          plan: {
            field: 'plan',
            reason: 'plan unavailable',
            suggestedValue: 'basic',
          },
          notes: {
            field: 'notes',
            reason: 'disabled',
            suggestedValue: '',
          },
        },
      },
    ]

    for (const { fouls, expected } of scenarios) {
      expect(foulMap(fouls)).toEqual(expected)
    }
  })

  test('keeps the last foul when fields are duplicated', () => {
    const fouls: Foul<TestFields>[] = [
      {
        field: 'plan',
        reason: 'old reason',
        suggestedValue: 'pro',
      },
      {
        field: 'plan',
        reason: 'new reason',
        suggestedValue: 'basic',
      },
    ]

    expect(foulMap(fouls)).toEqual({
      plan: fouls[1],
    })
  })
})
