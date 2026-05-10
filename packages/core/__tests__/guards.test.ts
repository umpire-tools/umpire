import { describe, expect, test } from 'bun:test'
import { isObjectLike, isPlainRecord, isRecord } from '../src/guards.js'

describe('guards', () => {
  test('detects records', () => {
    expect(isRecord({ alpha: true })).toBe(true)
    expect(isRecord(null)).toBe(false)
    expect(isRecord('alpha')).toBe(false)
  })

  test('detects object-like values', () => {
    expect(isObjectLike({ alpha: true })).toBe(true)
    expect(isObjectLike(() => true)).toBe(true)
    expect(isObjectLike(null)).toBe(false)
  })

  test('detects plain records without accepting arrays', () => {
    expect(isPlainRecord({ alpha: true })).toBe(true)
    expect(isPlainRecord(['alpha'])).toBe(false)
    expect(isPlainRecord(null)).toBe(false)
  })
})
