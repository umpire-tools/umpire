import { enabledWhen, fairWhen, requires, umpire } from '@umpire/core'
import { checkAssert } from '../src/index.js'

const ump = umpire({
  fields: {
    gate: {},
    guarded: {},
    flagged: {},
    pinned: { required: true },
  },
  rules: [
    requires('guarded', 'gate'),
    fairWhen('flagged', (val: string) => val !== 'bad'),
  ],
})

describe('checkAssert', () => {
  describe('.enabled()', () => {
    test('passes when all specified fields are enabled', () => {
      const result = ump.check({ gate: 'open', guarded: 'x' })
      expect(() => checkAssert(result).enabled('gate', 'guarded')).not.toThrow()
    })

    test('throws with reason when a field is disabled', () => {
      const result = ump.check({})
      expect(() => checkAssert(result).enabled('guarded')).toThrow(
        'checkAssert: expected "guarded" to be enabled — was disabled (reason: "requires gate")',
      )
    })

    test('throws without reason metadata when a field is disabled silently', () => {
      const silentUmp = umpire({
        fields: { guarded: {} },
        rules: [enabledWhen('guarded', () => false, { reason: () => '' })],
      })
      const result = silentUmp.check({})

      expect(() => checkAssert(result).enabled('guarded')).toThrow(
        'checkAssert: expected "guarded" to be enabled — was disabled',
      )
    })

    test('lists all failing fields when multiple are disabled', () => {
      const ump2 = umpire({
        fields: { a: {}, b: {}, c: {} },
        rules: [requires('b', 'a'), requires('c', 'a')],
      })
      const result = ump2.check({})
      expect(() => checkAssert(result).enabled('b', 'c')).toThrow(
        'expected the following field(s) to be enabled',
      )
    })
  })

  describe('.disabled()', () => {
    test('passes when fields are disabled', () => {
      const result = ump.check({})
      expect(() => checkAssert(result).disabled('guarded')).not.toThrow()
    })

    test('throws when a field is enabled', () => {
      const result = ump.check({ gate: 'open', guarded: 'x' })
      expect(() => checkAssert(result).disabled('guarded')).toThrow(
        'checkAssert: expected "guarded" to be disabled — was enabled',
      )
    })
  })

  describe('.fair()', () => {
    test('passes when fields are fair', () => {
      const result = ump.check({ flagged: 'good' })
      expect(() => checkAssert(result).fair('flagged')).not.toThrow()
    })

    test('passes for disabled fields (disabled fields are always fair)', () => {
      const result = ump.check({})
      expect(() => checkAssert(result).fair('guarded')).not.toThrow()
    })

    test('throws with reason when a field is foul', () => {
      const result = ump.check({ flagged: 'bad' })
      expect(() => checkAssert(result).fair('flagged')).toThrow(
        'checkAssert: expected "flagged" to be fair — was foul',
      )
    })
  })

  describe('.foul()', () => {
    test('passes when a field has a foul value', () => {
      const result = ump.check({ flagged: 'bad' })
      expect(() => checkAssert(result).foul('flagged')).not.toThrow()
    })

    test('throws when the field is fair', () => {
      const result = ump.check({ flagged: 'good' })
      expect(() => checkAssert(result).foul('flagged')).toThrow(
        'checkAssert: expected "flagged" to be foul — was fair (enabled: true)',
      )
    })

    test('throws when a disabled field is fair', () => {
      const result = ump.check({})
      expect(() => checkAssert(result).foul('guarded')).toThrow(
        'checkAssert: expected "guarded" to be foul — was fair (enabled: false)',
      )
    })
  })

  describe('.required()', () => {
    test('passes when the field is required', () => {
      const result = ump.check({})
      expect(() => checkAssert(result).required('pinned')).not.toThrow()
    })

    test('throws when the field is optional', () => {
      const result = ump.check({})
      expect(() => checkAssert(result).required('gate')).toThrow(
        'checkAssert: expected "gate" to be required — was optional',
      )
    })
  })

  describe('.optional()', () => {
    test('passes when the field is optional', () => {
      const result = ump.check({})
      expect(() => checkAssert(result).optional('gate')).not.toThrow()
    })

    test('throws when the field is required', () => {
      const result = ump.check({})
      expect(() => checkAssert(result).optional('pinned')).toThrow(
        'checkAssert: expected "pinned" to be optional — was required',
      )
    })
  })

  describe('.satisfied()', () => {
    test('passes when the field has a value', () => {
      const result = ump.check({ gate: 'open' })
      expect(() => checkAssert(result).satisfied('gate')).not.toThrow()
    })

    test('throws when the field has no value', () => {
      const result = ump.check({})
      expect(() => checkAssert(result).satisfied('gate')).toThrow(
        'checkAssert: expected "gate" to be satisfied — was unsatisfied (no value)',
      )
    })
  })

  describe('.unsatisfied()', () => {
    test('passes when the field has no value', () => {
      const result = ump.check({})
      expect(() => checkAssert(result).unsatisfied('gate')).not.toThrow()
    })

    test('throws when the field has a value', () => {
      const result = ump.check({ gate: 'open' })
      expect(() => checkAssert(result).unsatisfied('gate')).toThrow(
        'checkAssert: expected "gate" to be unsatisfied — was satisfied (has a value)',
      )
    })
  })

  describe('unknown field', () => {
    test('throws immediately for an unknown field name', () => {
      const result = ump.check({})
      expect(() =>
        checkAssert(result).enabled('nonexistent' as 'gate'),
      ).toThrow('checkAssert: unknown field "nonexistent"')
    })
  })

  describe('chaining', () => {
    test('multiple assertions can be chained on a single result', () => {
      const result = ump.check({ gate: 'open', flagged: 'good' })
      expect(() =>
        checkAssert(result)
          .enabled('gate', 'guarded')
          .fair('flagged')
          .optional('gate')
          .required('pinned'),
      ).not.toThrow()
    })
  })
})
