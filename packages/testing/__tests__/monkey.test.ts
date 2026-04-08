import { enabledWhen, requires, umpire } from '@umpire/core'
import { monkeyTest } from '../src/index.js'

describe('monkeyTest', () => {
  test('passes a well-formed umpire', () => {
    const ump = umpire({
      fields: {
        mode: {},
        details: { default: '' },
        submit: {},
      },
      rules: [
        enabledWhen('details', (values) => values.mode === 'a', {
          reason: 'Choose advanced mode first',
        }),
        requires('submit', 'mode', {
          reason: 'Pick a mode first',
        }),
      ],
    })

    expect(monkeyTest(ump)).toEqual({
      passed: true,
      violations: [],
      samplesChecked: 512,
    })
  })

  test('reports determinism violations for impure predicates', () => {
    let flip = false

    const ump = umpire({
      fields: {
        unstable: {},
      },
      rules: [
        enabledWhen('unstable', () => {
          flip = !flip
          return flip
        }, {
          reason: 'Impure predicate',
        }),
      ],
    })

    const result = monkeyTest(ump)

    expect(result.passed).toBe(false)
    expect(result.violations.some((violation) => violation.invariant === 'determinism')).toBe(true)
  })

  test('returns the expected result shape and random-sampling count', () => {
    const ump = umpire({
      fields: {
        alpha: {},
        beta: {},
        gamma: {},
        delta: {},
        epsilon: {},
        zeta: {},
        eta: {},
      },
      rules: [],
    })

    const result = monkeyTest(ump, { samples: 12, seed: 7 })

    expect(result).toEqual({
      passed: true,
      violations: [],
      samplesChecked: 12,
    })
    expect(typeof result.passed).toBe('boolean')
    expect(Array.isArray(result.violations)).toBe(true)
    expect(typeof result.samplesChecked).toBe('number')
  })
})
