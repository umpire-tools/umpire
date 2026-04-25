import { enabledWhen, requires, umpire } from '@umpire/core'
import { createReads, enabledWhenRead, fairWhenRead } from '@umpire/reads'
import { monkeyTest } from '../src/index.js'

const createAvailability = (
  fieldNames: string[],
  resolve: (field: string) => { enabled: boolean; fair: boolean },
) =>
  Object.fromEntries(
    fieldNames.map((field) => {
      const status = resolve(field)

      return [
        field,
        {
          enabled: status.enabled,
          fair: status.fair,
        },
      ]
    }),
  )

const createChallenge = (field: string, enabled: boolean, fair: boolean) => ({
  field,
  enabled,
  fair,
  directReasons: [],
  transitiveDeps: [],
  oneOfResolution: null,
})

describe('monkeyTest', () => {
  test('passes stable umpires for core and reads-backed rules', () => {
    const reads = createReads({
      motherboardFair: ({ input }) =>
        !input.motherboard || input.cpu === input.motherboard,
      canSubmit: ({ input }) =>
        Boolean(input.cpu) && Boolean(input.motherboard),
    })

    const umps = [
      umpire({
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
      }),
      umpire({
        fields: {
          cpu: {},
          motherboard: {},
          submit: {},
        },
        rules: [
          fairWhenRead('motherboard', 'motherboardFair', reads, {
            reason: 'Selected motherboard no longer matches the CPU socket',
          }),
          enabledWhenRead('submit', 'canSubmit', reads, {
            reason: 'Pick a CPU and motherboard first',
          }),
        ],
      }),
    ]

    for (const ump of umps) {
      expect(monkeyTest(ump)).toEqual({
        passed: true,
        violations: [],
        samplesChecked: 512,
      })
    }
  })

  test('reports determinism violations for impure predicates', () => {
    let flip = false

    const ump = umpire({
      fields: {
        unstable: {},
      },
      rules: [
        enabledWhen(
          'unstable',
          () => {
            flip = !flip
            return flip
          },
          {
            reason: 'Impure predicate',
          },
        ),
      ],
    })

    const result = monkeyTest(ump)

    expect(result.passed).toBe(false)
    expect(
      result.violations.some(
        (violation) => violation.invariant === 'determinism',
      ),
    ).toBe(true)
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
  })

  test('reports init-clean, self-play, convergence, challenge, and disabled-field violations', () => {
    const fieldNames = ['flag']

    const ump = {
      graph() {
        return { nodes: fieldNames, edges: [] }
      },
      init() {
        return { flag: 'stale' }
      },
      play() {
        return [{ field: 'flag', suggestedValue: null }]
      },
      check(values: Record<string, unknown>) {
        return createAvailability(fieldNames, () => ({
          enabled: values.flag == null,
          fair: true,
        }))
      },
      challenge(field: string) {
        return createChallenge(field, true, false)
      },
      scorecard() {
        throw new Error('scorecard() is not used by monkeyTest')
      },
    } as Parameters<typeof monkeyTest>[0]

    const result = monkeyTest(ump)

    expect(result.passed).toBe(false)
    expect(result.violations.map((violation) => violation.invariant)).toEqual(
      expect.arrayContaining([
        'init-clean',
        'self-play',
        'foul-convergence',
        'challenge-check-agreement',
        'disabled-field-immunity',
      ]),
    )
    expect(
      result.violations.some((violation) =>
        violation.description.includes('to null'),
      ),
    ).toBe(true)
    expect(
      result.violations.some((violation) =>
        violation.description.includes('to undefined'),
      ),
    ).toBe(true)
  })

  test('stops after the first sample once max violations are reached', () => {
    const scenarios = [
      {
        fieldNames: ['a', 'b', 'c', 'd', 'e', 'f'],
        edges: [{ from: 'ghost', to: 'phantom', type: 'test' }],
        options: undefined,
      },
      {
        fieldNames: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        edges: [],
        options: { samples: 25, seed: 7 },
      },
    ]

    for (const scenario of scenarios) {
      let checkCalls = 0

      const ump = {
        graph() {
          return { nodes: scenario.fieldNames, edges: scenario.edges }
        },
        init() {
          return {}
        },
        play() {
          return []
        },
        check() {
          checkCalls += 1

          return createAvailability(scenario.fieldNames, () => ({
            enabled: checkCalls > 1,
            fair: true,
          }))
        },
        challenge(field: string) {
          return createChallenge(field, false, true)
        },
        scorecard() {
          throw new Error('scorecard() is not used by monkeyTest')
        },
      } as Parameters<typeof monkeyTest>[0]

      const result = monkeyTest(ump, scenario.options)

      expect(result.passed).toBe(false)
      expect(result.samplesChecked).toBe(1)
      expect(result.violations).toHaveLength(50)
    }
  })
})
