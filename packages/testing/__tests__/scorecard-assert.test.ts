import { requires, umpire } from '@umpire/core'
import { scorecardAssert } from '../src/index.js'

const ump = umpire({
  fields: {
    cardType: {},
    cardNumber: {},
    expiryDate: {},
    billingZip: {},
  },
  rules: [
    requires('cardNumber', 'cardType', {
      reason: 'Pick a card type first',
    }),
    requires('expiryDate', 'cardNumber', {
      reason: 'Enter a card number first',
    }),
  ],
})

function buildResult() {
  return ump.scorecard(
    {
      values: {
        cardType: null,
        cardNumber: '4111111111111111',
        expiryDate: '12/30',
        billingZip: '10001',
      },
    },
    {
      before: {
        values: {
          cardType: 'visa',
          cardNumber: '4111111111111111',
          expiryDate: '12/30',
          billingZip: '10001',
        },
      },
    },
  )
}

describe('scorecardAssert', () => {
  describe('.changed()', () => {
    test('passes when fields changed in the transition', () => {
      expect(() =>
        scorecardAssert(buildResult()).changed('cardType'),
      ).not.toThrow()
    })

    test('throws when a field did not change', () => {
      expect(() =>
        scorecardAssert(buildResult()).changed('billingZip'),
      ).toThrow(
        'scorecardAssert: expected "billingZip" to be changed — did not change',
      )
    })
  })

  describe('.notChanged()', () => {
    test('passes when fields did not change', () => {
      expect(() =>
        scorecardAssert(buildResult()).notChanged('billingZip', 'cardNumber'),
      ).not.toThrow()
    })

    test('throws when a field changed', () => {
      expect(() =>
        scorecardAssert(buildResult()).notChanged('cardType'),
      ).toThrow(
        'scorecardAssert: expected "cardType" to be unchanged — changed',
      )
    })
  })

  describe('.cascaded()', () => {
    test('passes when fields cascaded from the change', () => {
      expect(() =>
        scorecardAssert(buildResult()).cascaded('cardNumber', 'expiryDate'),
      ).not.toThrow()
    })

    test('throws when a field did not cascade', () => {
      expect(() =>
        scorecardAssert(buildResult()).cascaded('billingZip'),
      ).toThrow(
        'scorecardAssert: expected "billingZip" to be cascaded — did not cascade',
      )
    })
  })

  describe('.fouled()', () => {
    test('passes when fields have foul recommendations', () => {
      expect(() =>
        scorecardAssert(buildResult()).fouled('cardNumber', 'expiryDate'),
      ).not.toThrow()
    })

    test('throws when a field has no foul recommendation', () => {
      expect(() => scorecardAssert(buildResult()).fouled('billingZip')).toThrow(
        'scorecardAssert: expected "billingZip" to be fouled — had no foul recommendation',
      )
    })
  })

  describe('.notFouled()', () => {
    test('passes when fields have no foul recommendation', () => {
      expect(() =>
        scorecardAssert(buildResult()).notFouled('cardType', 'billingZip'),
      ).not.toThrow()
    })

    test('passes for an enabled fair field with no foul recommendation', () => {
      const result = ump.scorecard({
        values: {
          cardType: 'visa',
          cardNumber: '4111111111111111',
          expiryDate: '12/30',
          billingZip: '10001',
        },
      })

      expect(() =>
        scorecardAssert(result).notFouled('billingZip'),
      ).not.toThrow()
    })

    test('throws with the foul reason when a field has a recommendation', () => {
      expect(() =>
        scorecardAssert(buildResult()).notFouled('cardNumber'),
      ).toThrow(
        'scorecardAssert: expected "cardNumber" to be not fouled — had foul recommendation (reason: "Pick a card type first")',
      )
    })
  })

  describe('.onlyChanged()', () => {
    test('passes when the exact changed field set matches', () => {
      expect(() =>
        scorecardAssert(buildResult()).onlyChanged('cardType'),
      ).not.toThrow()
    })

    test('throws when the changed set differs', () => {
      expect(() =>
        scorecardAssert(buildResult()).onlyChanged('cardType', 'billingZip'),
      ).toThrow(
        'scorecardAssert: expected only changed fields to be ["cardType","billingZip"] — missing ["billingZip"]',
      )
    })

    test('throws when the actual changed set has extra fields', () => {
      expect(() => scorecardAssert(buildResult()).onlyChanged()).toThrow(
        'scorecardAssert: expected only changed fields to be [] — unexpected ["cardType"]',
      )
    })
  })

  describe('.onlyFouled()', () => {
    test('passes when the exact fouled field set matches regardless of order', () => {
      expect(() =>
        scorecardAssert(buildResult()).onlyFouled('expiryDate', 'cardNumber'),
      ).not.toThrow()
    })

    test('throws when the fouled set differs', () => {
      expect(() =>
        scorecardAssert(buildResult()).onlyFouled('cardNumber'),
      ).toThrow(
        'scorecardAssert: expected only fouled fields to be ["cardNumber"] — unexpected ["expiryDate"]',
      )
    })

    test('throws when an expected fouled field is missing', () => {
      expect(() =>
        scorecardAssert(buildResult()).onlyFouled(
          'cardNumber',
          'expiryDate',
          'billingZip',
        ),
      ).toThrow(
        'scorecardAssert: expected only fouled fields to be ["cardNumber","expiryDate","billingZip"] — missing ["billingZip"]',
      )
    })
  })

  describe('.check()', () => {
    test('delegates to checkAssert for availability assertions', () => {
      expect(() =>
        scorecardAssert(buildResult())
          .check()
          .disabled('cardNumber', 'expiryDate')
          .enabled('billingZip')
          .fair('cardNumber', 'expiryDate'),
      ).not.toThrow()
    })
  })

  describe('unknown field', () => {
    test('throws immediately for an unknown field name', () => {
      expect(() =>
        scorecardAssert(buildResult()).changed('missing' as 'cardType'),
      ).toThrow('scorecardAssert: unknown field "missing"')
    })
  })

  describe('chaining', () => {
    test('multiple assertions can be chained on a single result', () => {
      expect(() =>
        scorecardAssert(buildResult())
          .changed('cardType')
          .notChanged('billingZip')
          .cascaded('cardNumber', 'expiryDate')
          .fouled('cardNumber')
          .notFouled('billingZip')
          .onlyChanged('cardType')
          .onlyFouled('cardNumber', 'expiryDate'),
      ).not.toThrow()
    })
  })
})
