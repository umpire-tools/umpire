import { describe, expect, test } from 'bun:test'
import { field, getFieldBuilderName } from '../src/field.js'

describe('field helpers', () => {
  test('returns a field builder name only for string metadata', () => {
    expect(getFieldBuilderName(field('alpha'))).toBe('alpha')
    expect(getFieldBuilderName({ __umpfield: 123 })).toBeUndefined()
    expect(getFieldBuilderName(null)).toBeUndefined()
  })
})
