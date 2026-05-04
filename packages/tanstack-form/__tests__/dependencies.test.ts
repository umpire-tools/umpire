import {
  enabledWhen,
  requires,
  umpire,
  disables,
  oneOf,
  eitherOf,
  fairWhen,
  defineRule,
  check,
} from '@umpire/core'
import { describe, it, expect } from 'bun:test'
import { getUmpireLinkedFields } from '../src/dependencies.js'

describe('getUmpireLinkedFields', () => {
  it('returns empty array for field with no inbound dependencies', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [requires('b', 'a')],
    })

    expect(getUmpireLinkedFields(engine, 'a')).toEqual([])
  })

  it('returns linked fields for requires dependency', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [requires('b', 'a')],
    })

    expect(getUmpireLinkedFields(engine, 'b')).toEqual(['a'])
  })

  it('returns linked fields for enabledWhen dependency', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', check('a', (v) => v === 'ok'))],
    })

    expect(getUmpireLinkedFields(engine, 'b')).toEqual(['a'])
  })

  it('returns linked fields for fairWhen dependency', () => {
    const predicate = ((_val: unknown, values: Record<string, unknown>) =>
      values.a === 'ok') as {
      (value: unknown, values: Record<string, unknown>, conditions: Record<string, unknown>): boolean
      _checkField?: string
    }
    predicate._checkField = 'a'

    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [fairWhen('b', predicate)],
    })

    expect(getUmpireLinkedFields(engine, 'b')).toEqual(['a'])
  })

  it('returns linked fields for disables rule', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [disables('a', ['b'])],
    })

    expect(getUmpireLinkedFields(engine, 'b')).toEqual(['a'])
  })

  it('returns linked fields for oneOf group members', () => {
    const engine = umpire({
      fields: { a: {}, b: {}, c: {}, d: {} },
      rules: [
        oneOf('group', { first: ['a', 'b'], second: ['c', 'd'] }),
      ],
    })

    const result = getUmpireLinkedFields(engine, 'a')
    expect(result).toEqual(['c', 'd'])
  })

  it('returns linked fields for eitherOf group members', () => {
    const engine = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [
        eitherOf('group', {
          branchA: [requires('b', 'a')],
          branchB: [enabledWhen('b', check('c', (v) => v === 'ok'))],
        }),
      ],
    })

    const result = getUmpireLinkedFields(engine, 'b')
    expect(result).toEqual(['a', 'c'])
  })

  it('deduplicates multiple inbound edges from different sources', () => {
    const engine = umpire({
      fields: { a: {}, b: {}, c: {}, d: {} },
      rules: [
        requires('d', 'a'),
        requires('d', 'b'),
        enabledWhen('d', check('a', (v) => v === 'ok')),
        disables('c', ['d']),
      ],
    })

    const result = getUmpireLinkedFields(engine, 'd')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('excludes self-reference by default', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [requires('b', 'a')],
    })

    const result = getUmpireLinkedFields(engine, 'b')
    expect(result).toEqual(['a'])
    expect(result).not.toContain('b')
  })

  it('excludeSelf: false without self-edge returns same result as default', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [requires('b', 'a')],
    })

    const defaultResult = getUmpireLinkedFields(engine, 'b')
    const explicitResult = getUmpireLinkedFields(engine, 'b', { excludeSelf: false })
    expect(explicitResult).toEqual(defaultResult)
    expect(explicitResult).not.toContain('b')
  })

  it('uses listenTo explicit override and skips graph lookup', () => {
    const engine = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [requires('c', 'a')],
    })

    const result = getUmpireLinkedFields(engine, 'c', {
      listenTo: ['x', 'y', 'z'],
    })
    expect(result).toEqual(['x', 'y', 'z'])
  })

  it('includes custom/opaque rule type edges', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [
        defineRule({
          type: 'custom-opaque',
          targets: ['b'],
          sources: ['a'],
          evaluate: () => new Map([['b', { enabled: true, reason: null }]]),
        }),
      ],
    })

    const result = getUmpireLinkedFields(engine, 'b')
    expect(result).toEqual(['a'])
  })
})
