import {
  isEmptyArray,
  isEmptyBigInt,
  isEmptyBoolean,
  isEmptyObject,
  isEmptyNumber,
  isEmptyPresent,
  isEmptyString,
  isSatisfied,
} from '../src/index.js'

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
    expect(isEmptyObject(null)).toBe(true)
    expect(isEmptyObject('theme')).toBe(true)
    expect(isEmptyObject(0)).toBe(true)
    expect(isEmptyObject(() => {})).toBe(true)

    const inherited = Object.create({ theme: 'dark' })

    expect(isEmptyObject(inherited)).toBe(true)
    expect(isSatisfied({}, { isEmpty: isEmptyObject })).toBe(false)
    expect(isSatisfied({ theme: 'dark' }, { isEmpty: isEmptyObject })).toBe(
      true,
    )
  })
})

describe('isEmptyNumber', () => {
  test('0 is not empty', () => expect(isEmptyNumber(0)).toBe(false))
  test('1 is not empty', () => expect(isEmptyNumber(1)).toBe(false))
  test('-1 is not empty', () => expect(isEmptyNumber(-1)).toBe(false))
  test('NaN is empty', () => {
    expect(isEmptyNumber(NaN)).toBe(true)
  })
  test('non-number is empty', () => {
    expect(isEmptyNumber('1')).toBe(true)
  })
  test('null is empty', () => {
    expect(isEmptyNumber(null)).toBe(true)
  })
})

describe('isEmptyBigInt', () => {
  test('BigInt(0) is not empty', () => {
    expect(isEmptyBigInt(BigInt(0))).toBe(false)
  })
  test('BigInt(1) is not empty', () => {
    expect(isEmptyBigInt(BigInt(1))).toBe(false)
  })
  test('non-bigint is empty', () => {
    expect(isEmptyBigInt(0)).toBe(true)
  })
})

describe('isEmptyBoolean', () => {
  test('false is not empty', () => {
    expect(isEmptyBoolean(false)).toBe(false)
  })
  test('true is not empty', () => {
    expect(isEmptyBoolean(true)).toBe(false)
  })
  test('non-boolean is empty', () => {
    expect(isEmptyBoolean('true')).toBe(true)
  })
})
