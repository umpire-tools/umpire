import { describe, expect, spyOn, test } from 'bun:test'
import { oneOf } from '../src/rules.js'
import { umpire } from '../src/umpire.js'

type TestFields = {
  alpha: {}
  beta: {}
  gamma: {}
  mode: {}
}

describe('oneOf resolution', () => {
  test('auto-detects a single satisfied branch', () => {
    const ump = umpire<TestFields>({
      fields: { alpha: {}, beta: {}, gamma: {}, mode: {} },
      rules: [
        oneOf<TestFields>('strategy', {
          first: ['alpha'],
          second: ['beta', 'gamma'],
        }),
      ],
    })

    const result = ump.check({ beta: 'set' })

    expect(result.alpha).toMatchObject({
      enabled: false,
      reason: 'conflicts with second strategy',
    })
    expect(result.beta.enabled).toBe(true)
    expect(result.gamma.enabled).toBe(true)
  })

  test('leaves all fields enabled when no branch is satisfied', () => {
    const ump = umpire<TestFields>({
      fields: { alpha: {}, beta: {}, gamma: {}, mode: {} },
      rules: [
        oneOf<TestFields>('strategy', {
          first: ['alpha'],
          second: ['beta'],
        }),
      ],
    })

    const result = ump.check({})

    expect(result.alpha.enabled).toBe(true)
    expect(result.beta.enabled).toBe(true)
  })

  test('uses prev to resolve ambiguity in favor of the newly satisfied branch', () => {
    const ump = umpire<TestFields>({
      fields: { alpha: {}, beta: {}, gamma: {}, mode: {} },
      rules: [
        oneOf<TestFields>('strategy', {
          first: ['alpha'],
          second: ['beta'],
        }),
      ],
    })

    const result = ump.check(
      { alpha: 'still here', beta: 'new value' },
      undefined,
      { alpha: 'still here' },
    )

    expect(result.alpha.enabled).toBe(false)
    expect(result.beta.enabled).toBe(true)
  })

  test('warns and falls back when prev yields two newly satisfied branches', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const ump = umpire<TestFields>({
        fields: { alpha: {}, beta: {}, gamma: {}, mode: {} },
        rules: [
          oneOf<TestFields>('strategy', {
            first: ['alpha'],
            second: ['beta'],
          }),
        ],
      })

      const result = ump.check({ alpha: 'set', beta: 'set' }, undefined, {
        gamma: 'already set',
      })

      expect(result.alpha.enabled).toBe(true)
      expect(result.beta).toMatchObject({
        enabled: false,
        reason: 'conflicts with first strategy',
      })
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  test('falls back to the first satisfied branch and warns when prev is absent', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const ump = umpire<TestFields>({
        fields: { alpha: {}, beta: {}, gamma: {}, mode: {} },
        rules: [
          oneOf<TestFields>('strategy', {
            first: ['alpha'],
            second: ['beta'],
          }),
        ],
      })

      const result = ump.check({ alpha: 'set', beta: 'set' })

      expect(result.alpha.enabled).toBe(true)
      expect(result.beta).toMatchObject({
        enabled: false,
        reason: 'conflicts with first strategy',
      })
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  test('uses a static activeBranch when configured', () => {
    const ump = umpire<TestFields>({
      fields: { alpha: {}, beta: {}, gamma: {}, mode: {} },
      rules: [
        oneOf<TestFields>(
          'strategy',
          {
            first: ['alpha'],
            second: ['beta'],
          },
          { activeBranch: 'second' },
        ),
      ],
    })

    const result = ump.check({ alpha: 'set' })

    expect(result.alpha.enabled).toBe(false)
    expect(result.beta.enabled).toBe(true)
  })

  test('uses a dynamic activeBranch function when configured', () => {
    const ump = umpire<TestFields>({
      fields: { alpha: {}, beta: {}, gamma: {}, mode: {} },
      rules: [
        oneOf<TestFields>(
          'strategy',
          {
            first: ['alpha'],
            second: ['beta'],
          },
          {
            activeBranch: (values) =>
              values.mode === 'second' ? 'second' : 'first',
          },
        ),
      ],
    })

    const result = ump.check({ mode: 'second' })

    expect(result.alpha.enabled).toBe(false)
    expect(result.beta.enabled).toBe(true)
  })

  test('throws when an explicit activeBranch does not exist', () => {
    expect(() =>
      oneOf<TestFields>(
        'strategy',
        {
          first: ['alpha'],
          second: ['beta'],
        },
        {
          activeBranch: 'missing',
        },
      ),
    ).toThrow('Unknown active branch "missing" for oneOf("strategy")')
  })

  test('enables all branches when activeBranch returns null', () => {
    const ump = umpire<TestFields>({
      fields: { alpha: {}, beta: {}, gamma: {}, mode: {} },
      rules: [
        oneOf<TestFields>(
          'strategy',
          {
            first: ['alpha'],
            second: ['beta'],
          },
          { activeBranch: () => null },
        ),
      ],
    })

    const result = ump.check({ alpha: 'set', beta: 'set' })

    expect(result.alpha.enabled).toBe(true)
    expect(result.beta.enabled).toBe(true)
  })

  test('activeBranch function receives conditions', () => {
    type Ctx = { pitcher: 'L' | 'R' }

    const ump = umpire<TestFields, Ctx>({
      fields: { alpha: {}, beta: {}, gamma: {}, mode: {} },
      rules: [
        oneOf<TestFields, Ctx>(
          'platoon',
          {
            vsLefty: ['alpha'],
            vsRighty: ['beta'],
          },
          {
            activeBranch: (_values, conditions) =>
              conditions.pitcher === 'L' ? 'vsLefty' : 'vsRighty',
          },
        ),
      ],
    })

    const vsLefty = ump.check({}, { pitcher: 'L' })
    expect(vsLefty.alpha.enabled).toBe(true)
    expect(vsLefty.beta.enabled).toBe(false)
    expect(vsLefty.beta.reason).toBe('conflicts with vsLefty strategy')

    const vsRighty = ump.check({}, { pitcher: 'R' })
    expect(vsRighty.alpha.enabled).toBe(false)
    expect(vsRighty.beta.enabled).toBe(true)
  })
})
