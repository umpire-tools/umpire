import {
  anyOf,
  eitherOf,
  fairWhen,
  oneOf,
  requires,
  type Rule,
  umpire,
} from '@umpire/core'
import { trackCoverage } from '../src/index.js'

type Fields = {
  mode: {}
  details: {}
  cardNumber: {}
  expiry: {}
  submit: {}
}

const fields: Fields = {
  mode: {},
  details: {},
  cardNumber: {},
  expiry: {},
  submit: {},
}

describe('trackCoverage', () => {
  test('records field states from check calls', () => {
    const tracker = trackCoverage(
      umpire({
        fields,
        rules: [
          requires('details', 'mode'),
          fairWhen('cardNumber', (value) => value === '4111', {
            reason: 'Use a test Visa number',
          }),
        ],
      }),
    )

    tracker.ump.check({ mode: 'card', details: 'open', cardNumber: '4111' })
    tracker.ump.check({ mode: null, details: 'open', cardNumber: '5555' })

    expect(tracker.report().fieldStates.details).toEqual({
      seenEnabled: true,
      seenDisabled: true,
      seenFair: true,
      seenFoul: false,
      seenSatisfied: true,
      seenUnsatisfied: false,
    })
    expect(tracker.report().fieldStates.cardNumber).toMatchObject({
      seenFair: true,
      seenFoul: true,
    })
    expect(tracker.report().fieldStates.expiry).toMatchObject({
      seenSatisfied: false,
      seenUnsatisfied: true,
    })
  })

  test('records field states and rule coverage from scorecard calls', () => {
    const tracker = trackCoverage(
      umpire({
        fields,
        rules: [requires('details', 'mode')],
      }),
    )

    const scorecard = tracker.ump.scorecard(
      { values: { mode: null, details: 'open' } },
      { before: { values: { mode: 'advanced', details: 'open' } } },
    )

    expect(scorecard.check.details.enabled).toBe(false)
    expect(tracker.report().fieldStates.details.seenDisabled).toBe(true)
    expect(tracker.report().uncoveredRules).toEqual([])
  })

  test('records foul field states from scorecard calls', () => {
    const tracker = trackCoverage(
      umpire({
        fields,
        rules: [
          fairWhen('cardNumber', (value) => value === '4111', {
            reason: 'Use a test Visa number',
          }),
        ],
      }),
    )

    const scorecard = tracker.ump.scorecard({
      values: { cardNumber: '5555' },
    })

    expect(scorecard.check.cardNumber.fair).toBe(false)
    expect(tracker.report().fieldStates.cardNumber.seenFoul).toBe(true)
    expect(tracker.report().uncoveredRules).toEqual([])
  })

  test('preserves return values and forwards conditions and prev', () => {
    type Conditions = { allowDetails?: boolean }
    const seen: Array<{
      conditions: Conditions
      prev: unknown
    }> = []
    const rule: Rule<Fields, Conditions> = {
      type: 'custom',
      targets: ['details'],
      sources: ['mode'],
      evaluate: (_values, conditions, prev) => {
        seen.push({ conditions, prev })
        return new Map([
          [
            'details',
            {
              enabled: conditions.allowDetails === true,
              reason:
                conditions.allowDetails === true
                  ? null
                  : 'Details are not allowed',
            },
          ],
        ])
      },
    }
    const base = umpire<Fields, Conditions>({
      fields,
      rules: [rule],
    })
    const tracker = trackCoverage(base)
    const conditions = { allowDetails: false }
    const prev = { mode: 'basic' }

    const result = tracker.ump.check(
      { mode: 'advanced', details: 'open' },
      conditions,
      prev,
    )

    expect(result).toEqual(
      base.check({ mode: 'advanced', details: 'open' }, conditions, prev),
    )
    expect(seen).toContainEqual({ conditions, prev })
  })

  test('supports reset', () => {
    const tracker = trackCoverage(
      umpire({
        fields,
        rules: [requires('details', 'mode')],
      }),
    )

    tracker.ump.check({ mode: null, details: 'open' })
    expect(tracker.report().fieldStates.details.seenDisabled).toBe(true)

    tracker.reset()

    expect(tracker.report().fieldStates.details).toEqual({
      seenEnabled: false,
      seenDisabled: false,
      seenFair: false,
      seenFoul: false,
      seenSatisfied: false,
      seenUnsatisfied: false,
    })
    expect(tracker.report().uncoveredRules).toEqual([
      {
        index: 0,
        id: expect.any(String),
        description: 'requires(details, mode)',
      },
    ])
  })

  test('distinguishes same-type direct rules by ruleId', () => {
    const tracker = trackCoverage(
      umpire({
        fields,
        rules: [requires('submit', 'mode'), requires('submit', 'cardNumber')],
      }),
    )

    expect(tracker.report().uncoveredRules).toEqual([
      {
        index: 0,
        id: expect.any(String),
        description: 'requires(submit, mode)',
      },
      {
        index: 1,
        id: expect.any(String),
        description: 'requires(submit, cardNumber)',
      },
    ])

    tracker.ump.check({ mode: 'card', submit: true })

    expect(tracker.report().uncoveredRules).toEqual([
      {
        index: 0,
        id: expect.any(String),
        description: 'requires(submit, mode)',
      },
    ])
  })

  test('collects nested anyOf and eitherOf rule coverage', () => {
    const tracker = trackCoverage(
      umpire({
        fields,
        rules: [
          anyOf(requires('submit', 'mode'), requires('submit', 'cardNumber')),
          eitherOf('payment', {
            card: [requires('expiry', 'cardNumber')],
            details: [requires('expiry', 'details')],
          }),
        ],
      }),
    )

    const result = tracker.ump.check({ submit: true, expiry: '12/30' })

    expect(result.submit.enabled).toBe(false)
    expect(result.expiry.enabled).toBe(false)
    expect(tracker.report().uncoveredRules).toEqual([])
  })

  test('does not collect coverage from direct challenge calls', () => {
    const tracker = trackCoverage(
      umpire({
        fields,
        rules: [requires('details', 'mode')],
      }),
    )

    tracker.ump.challenge('details', { details: 'open' })

    expect(tracker.report().uncoveredRules).toEqual([
      {
        index: 0,
        id: expect.any(String),
        description: 'requires(details, mode)',
      },
    ])
  })

  test('marks oneOf rules as covered when a branch is disabled', () => {
    const tracker = trackCoverage(
      umpire({
        fields,
        rules: [
          oneOf(
            'entry',
            { card: ['cardNumber'], details: ['details'] },
            {
              activeBranch: 'card',
            },
          ),
        ],
      }),
    )

    expect(tracker.report().uncoveredRules).toEqual([
      {
        index: 0,
        id: expect.any(String),
        description: 'oneOf(entry)',
      },
    ])

    tracker.ump.check({ details: 'open' })

    expect(tracker.report().uncoveredRules).toEqual([])
  })

  test('uses a fallback description for uninspectable rules', () => {
    const opaqueRule: Rule<Fields> = {
      type: 'opaque',
      targets: ['details'],
      sources: [],
      evaluate: () =>
        new Map([['details', { enabled: false, reason: 'Hidden test rule' }]]),
    }
    const tracker = trackCoverage(
      umpire({
        fields,
        rules: [opaqueRule],
      }),
    )

    expect(tracker.report().uncoveredRules).toEqual([
      {
        index: 0,
        id: expect.any(String),
        description: 'uninspectable rule #0',
      },
    ])

    tracker.ump.check({ details: 'open' })

    expect(tracker.report().uncoveredRules).toEqual([])
  })
})
