import { isEmptyArray, isEmptyObject, isEmptyPresent, isEmptyString, isSatisfied } from '../src/index.js'

describe('emptiness helpers', () => {
  test('isEmptyPresent matches the default nil-only emptiness semantics', () => {
    expect(isEmptyPresent(undefined)).toBe(true)
    expect(isEmptyPresent(null)).toBe(true)
    expect(isEmptyPresent('')).toBe(false)
    expect(isEmptyPresent([])).toBe(false)
    expect(isSatisfied(undefined)).toBe(false)
    expect(isSatisfied(null)).toBe(false)
    expect(isSatisfied('')).toBe(true)
  })

  test('isEmptyString matches common string form semantics', () => {
    expect(isEmptyString('')).toBe(true)
    expect(isEmptyString('hello')).toBe(false)
    expect(isEmptyString(undefined)).toBe(true)
    expect(isSatisfied('', { isEmpty: isEmptyString })).toBe(false)
    expect(isSatisfied('hello', { isEmpty: isEmptyString })).toBe(true)
  })

  test('isEmptyArray matches common array form semantics', () => {
    expect(isEmptyArray([])).toBe(true)
    expect(isEmptyArray(['x'])).toBe(false)
    expect(isEmptyArray(undefined)).toBe(true)
    expect(isSatisfied([], { isEmpty: isEmptyArray })).toBe(false)
    expect(isSatisfied(['x'], { isEmpty: isEmptyArray })).toBe(true)
  })

  test('isEmptyObject treats empty plain objects as empty', () => {
    expect(isEmptyObject({})).toBe(true)
    expect(isEmptyObject({ theme: 'dark' })).toBe(false)
    expect(isEmptyObject([])).toBe(true)
    expect(isEmptyObject(undefined)).toBe(true)
    expect(isSatisfied({}, { isEmpty: isEmptyObject })).toBe(false)
    expect(isSatisfied({ theme: 'dark' }, { isEmpty: isEmptyObject })).toBe(true)
  })
})
