import { enabledWhen, fairWhen } from '../src/rules.js'
import { umpire } from '../src/umpire.js'

type TestFields = {
  toggle: {}
  dependent: { default?: unknown; isEmpty?: (value: unknown) => boolean }
  other: { default?: unknown; isEmpty?: (value: unknown) => boolean }
}

type TestConditions = {
  plan?: 'basic' | 'pro'
}

describe('play', () => {
  test('does not recommend a reset when the current value matches the default by Setoid equality', () => {
    class SemanticallyEqualValue {
      constructor(private readonly value: string) {}

      'fantasy-land/equals'(other: unknown) {
        return (
          other instanceof SemanticallyEqualValue && other.value === this.value
        )
      }
    }

    const ump = umpire<TestFields>({
      fields: {
        toggle: {},
        dependent: { default: new SemanticallyEqualValue('shared') },
        other: {},
      },
      rules: [
        enabledWhen<TestFields, TestConditions>(
          'dependent',
          (values) => values.toggle === true,
        ),
      ],
    })

    const recommendations = ump.play(
      {
        values: {
          toggle: true,
          dependent: new SemanticallyEqualValue('shared'),
        },
      },
      {
        values: {
          toggle: false,
          dependent: new SemanticallyEqualValue('shared'),
        },
      },
    )

    expect(recommendations).toEqual([])
  })

  test('does not recommend a reset on foul transitions when current value matches default by Setoid equality', () => {
    class SemanticallyEqualValue {
      constructor(private readonly value: string) {}

      'fantasy-land/equals'(other: unknown) {
        return (
          other instanceof SemanticallyEqualValue && other.value === this.value
        )
      }
    }

    const ump = umpire<TestFields>({
      fields: {
        toggle: {},
        dependent: { default: new SemanticallyEqualValue('shared') },
        other: {},
      },
      rules: [
        fairWhen<TestFields, TestConditions>(
          'dependent',
          (_value, values) => values.toggle === true,
        ),
      ],
    })

    const recommendations = ump.play(
      {
        values: {
          toggle: true,
          dependent: new SemanticallyEqualValue('shared'),
        },
      },
      {
        values: {
          toggle: false,
          dependent: new SemanticallyEqualValue('shared'),
        },
      },
    )

    expect(recommendations).toEqual([])
  })

  test('recommends a reset when a field transitions from enabled to disabled with a value', () => {
    const ump = umpire<TestFields>({
      fields: {
        toggle: {},
        dependent: {},
        other: {},
      },
      rules: [
        enabledWhen<TestFields, TestConditions>(
          'dependent',
          (values) => values.toggle === true,
        ),
      ],
    })

    const recommendations = ump.play(
      { values: { toggle: true, dependent: 'keep me' } },
      { values: { toggle: false, dependent: 'keep me' } },
    )

    expect(recommendations).toEqual([
      {
        field: 'dependent',
        reason: 'condition not met',
        suggestedValue: undefined,
      },
    ])
  })

  test('does not recommend a reset when the field was already disabled', () => {
    const ump = umpire<TestFields>({
      fields: {
        toggle: {},
        dependent: {},
        other: {},
      },
      rules: [
        enabledWhen<TestFields, TestConditions>(
          'dependent',
          (values) => values.toggle === true,
        ),
      ],
    })

    const recommendations = ump.play(
      { values: { toggle: false, dependent: 'stale' } },
      { values: { toggle: false, dependent: 'stale' } },
    )

    expect(recommendations).toEqual([])
  })

  test('does not recommend a reset when the field value is empty per isEmpty', () => {
    const ump = umpire<TestFields>({
      fields: {
        toggle: {},
        dependent: { isEmpty: (value) => value === '' || value == null },
        other: {},
      },
      rules: [
        enabledWhen<TestFields, TestConditions>(
          'dependent',
          (values) => values.toggle === true,
        ),
      ],
    })

    const recommendations = ump.play(
      { values: { toggle: true, dependent: '' } },
      { values: { toggle: false, dependent: '' } },
    )

    expect(recommendations).toEqual([])
  })

  test('does not recommend a reset when the current value already equals the suggested default', () => {
    const ump = umpire<TestFields>({
      fields: {
        toggle: {},
        dependent: { default: '09:00' },
        other: {},
      },
      rules: [
        enabledWhen<TestFields, TestConditions>(
          'dependent',
          (values) => values.toggle === true,
        ),
      ],
    })

    const recommendations = ump.play(
      { values: { toggle: true, dependent: '09:00' } },
      { values: { toggle: false, dependent: '09:00' } },
    )

    expect(recommendations).toEqual([])
  })

  test('uses FieldDef.default when present and undefined otherwise', () => {
    const ump = umpire<TestFields>({
      fields: {
        toggle: {},
        dependent: { default: '09:00' },
        other: {},
      },
      rules: [
        enabledWhen<TestFields, TestConditions>(
          'dependent',
          (values) => values.toggle === true,
        ),
        enabledWhen<TestFields, TestConditions>(
          'other',
          (values) => values.toggle === true,
        ),
      ],
    })

    const recommendations = ump.play(
      { values: { toggle: true, dependent: '12:00', other: 'notes' } },
      { values: { toggle: false, dependent: '12:00', other: 'notes' } },
    )

    expect(recommendations).toEqual([
      {
        field: 'dependent',
        reason: 'condition not met',
        suggestedValue: '09:00',
      },
      {
        field: 'other',
        reason: 'condition not met',
        suggestedValue: undefined,
      },
    ])
  })

  test('supports conditions-only transitions', () => {
    const ump = umpire<TestFields, TestConditions>({
      fields: {
        toggle: {},
        dependent: {},
        other: {},
      },
      rules: [
        enabledWhen<TestFields, TestConditions>(
          'dependent',
          (_values, conditions) => conditions.plan === 'pro',
          { reason: 'pro plan required' },
        ),
      ],
    })

    const recommendations = ump.play(
      { values: { dependent: 'kept' }, conditions: { plan: 'pro' } },
      { values: { dependent: 'kept' }, conditions: { plan: 'basic' } },
    )

    expect(recommendations).toEqual([
      {
        field: 'dependent',
        reason: 'pro plan required',
        suggestedValue: undefined,
      },
    ])
  })

  test('converges after applying all recommendations', () => {
    const ump = umpire<TestFields>({
      fields: {
        toggle: {},
        dependent: { isEmpty: (value) => value == null || value === '' },
        other: { default: '09:00' },
      },
      rules: [
        enabledWhen<TestFields, TestConditions>(
          'dependent',
          (values) => values.toggle === true,
        ),
        enabledWhen<TestFields, TestConditions>(
          'other',
          (values) => values.toggle === true,
        ),
      ],
    })

    const before = {
      values: { toggle: true, dependent: 'stale', other: '12:00' },
    }
    const after = {
      values: { toggle: false, dependent: 'stale', other: '12:00' },
    }
    const recommendations = ump.play(before, after)

    const resetValues = { ...after.values }
    for (const recommendation of recommendations) {
      resetValues[recommendation.field] = recommendation.suggestedValue
    }

    expect(recommendations).toHaveLength(2)
    expect(
      ump.play(after, {
        values: resetValues,
      }),
    ).toEqual([])
  })
})
