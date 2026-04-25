import {
  anyOf,
  check,
  defineRule,
  disables,
  eitherOf,
  enabledWhen,
  fairWhen,
  oneOf,
  requires,
} from '../src/index.js'

describe('public entrypoint', () => {
  test('exports all rule builders', () => {
    expect(typeof defineRule).toBe('function')
    expect(typeof eitherOf).toBe('function')
    expect(typeof enabledWhen).toBe('function')
    expect(typeof fairWhen).toBe('function')
    expect(typeof disables).toBe('function')
    expect(typeof requires).toBe('function')
    expect(typeof oneOf).toBe('function')
    expect(typeof anyOf).toBe('function')
    expect(typeof check).toBe('function')
  })
})
