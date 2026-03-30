import { isSatisfied } from '../src/satisfaction.js'

describe('isSatisfied', () => {
  test.each([
    [undefined, false],
    [null, false],
    [0, true],
    ['', true],
    [false, true],
    [[], true],
    ['hello', true],
  ])('treats %p as %p by default', (value, expected) => {
    expect(isSatisfied(value)).toBe(expected)
  })

  test('uses string emptiness override when provided', () => {
    const fieldDef = { isEmpty: (value: unknown) => value === '' }

    expect(isSatisfied('', fieldDef)).toBe(false)
    expect(isSatisfied('hello', fieldDef)).toBe(true)
  })

  test('uses array emptiness override when provided', () => {
    const fieldDef = {
      isEmpty: (value: unknown) => !Array.isArray(value) || value.length === 0,
    }

    expect(isSatisfied([], fieldDef)).toBe(false)
    expect(isSatisfied([1], fieldDef)).toBe(true)
  })
})
