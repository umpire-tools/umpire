import { valuesEqual } from '../src/equality.js'
import { valuesEqual as valuesEqualFromIndex } from '../src/index.js'

describe('valuesEqual', () => {
  test('is re-exported from the core index entrypoint', () => {
    expect(valuesEqualFromIndex(1, 1)).toBe(true)
  })

  test('compares primitives with Object.is semantics', () => {
    expect(valuesEqual(1, 1)).toBe(true)
    expect(valuesEqual(1, 2)).toBe(false)
    expect(valuesEqual('a', 'a')).toBe(true)
    expect(valuesEqual('a', 'b')).toBe(false)
  })

  test('treats null as equal only to null', () => {
    expect(valuesEqual(null, null)).toBe(true)
    expect(valuesEqual(null, undefined)).toBe(false)
  })

  test('does not treat plain objects as equal without Setoid support', () => {
    expect(valuesEqual({ id: 1 }, { id: 1 })).toBe(false)
  })

  test('uses the left fantasy-land equals implementation when present', () => {
    expect(
      valuesEqual(
        {
          'fantasy-land/equals': (other: unknown) =>
            other instanceof Date && other.getTime() === 123,
        },
        new Date(123),
      ),
    ).toBe(true)
  })

  test('returns false when the left fantasy-land equals implementation says so', () => {
    expect(
      valuesEqual(
        {
          'fantasy-land/equals': () => false,
        },
        { id: 1 },
      ),
    ).toBe(false)
  })

  test('falls back to Object.is when fantasy-land equals is not a function', () => {
    expect(
      valuesEqual(
        { 'fantasy-land/equals': true },
        { 'fantasy-land/equals': true },
      ),
    ).toBe(false)
  })

  test('falls back to Object.is semantics without Setoid support', () => {
    const shared = { id: 1 }

    expect(valuesEqual(shared, shared)).toBe(true)
    expect(valuesEqual(NaN, NaN)).toBe(true)
    expect(valuesEqual(-0, 0)).toBe(false)
  })

  test('ignores right-side setoid support when the left side is not a setoid', () => {
    expect(
      valuesEqual(
        { id: 1 },
        {
          'fantasy-land/equals': () => true,
          id: 1,
        },
      ),
    ).toBe(false)
  })
})
