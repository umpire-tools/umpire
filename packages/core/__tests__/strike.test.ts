import { strike } from '../src/strike.js'

describe('strike', () => {
  test('returns the same object when there are no fouls', () => {
    const values = { team: 'home', score: 3 }

    const next = strike(values, [])

    expect(next).toBe(values)
  })

  test('applies suggested values by field', () => {
    const values = {
      plan: 'business',
      companyName: 'Acme',
      companySize: '50',
    }

    const next = strike(values, [
      { field: 'companyName', reason: 'business plan required', suggestedValue: undefined },
      { field: 'companySize', reason: 'business plan required', suggestedValue: '' },
    ])

    expect(next).toEqual({
      plan: 'business',
      companyName: undefined,
      companySize: '',
    })
    expect(values).toEqual({
      plan: 'business',
      companyName: 'Acme',
      companySize: '50',
    })
    expect(next).not.toBe(values)
  })

  test('returns the same object when all suggestions are already applied', () => {
    const values = {
      plan: 'personal',
      companyName: undefined,
    }

    const next = strike(values, [
      { field: 'companyName', reason: 'business plan required', suggestedValue: undefined },
    ])

    expect(next).toBe(values)
  })
})
