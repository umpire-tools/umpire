import { enabledWhen } from '../src/rules.js'
import { umpire } from '../src/umpire.js'

type TestFields = {
  toggle: {}
  dependent: { default?: unknown; isEmpty?: (value: unknown) => boolean }
  other: { default?: unknown; isEmpty?: (value: unknown) => boolean }
}

type TestContext = {
  plan?: 'basic' | 'pro'
}

describe('flag', () => {
  test('recommends a reset when a field transitions from enabled to disabled with a value', () => {
    const ump = umpire<TestFields>({
      fields: {
        toggle: {},
        dependent: {},
        other: {},
      },
      rules: [enabledWhen<TestFields, TestContext>('dependent', (values) => values.toggle === true)],
    })

    const recommendations = ump.flag(
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
      rules: [enabledWhen<TestFields, TestContext>('dependent', (values) => values.toggle === true)],
    })

    const recommendations = ump.flag(
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
      rules: [enabledWhen<TestFields, TestContext>('dependent', (values) => values.toggle === true)],
    })

    const recommendations = ump.flag(
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
      rules: [enabledWhen<TestFields, TestContext>('dependent', (values) => values.toggle === true)],
    })

    const recommendations = ump.flag(
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
        enabledWhen<TestFields, TestContext>('dependent', (values) => values.toggle === true),
        enabledWhen<TestFields, TestContext>('other', (values) => values.toggle === true),
      ],
    })

    const recommendations = ump.flag(
      { values: { toggle: true, dependent: '12:00', other: 'notes' } },
      { values: { toggle: false, dependent: '12:00', other: 'notes' } },
    )

    expect(recommendations).toEqual([
      { field: 'dependent', reason: 'condition not met', suggestedValue: '09:00' },
      { field: 'other', reason: 'condition not met', suggestedValue: undefined },
    ])
  })

  test('supports context-only transitions', () => {
    const ump = umpire<TestFields, TestContext>({
      fields: {
        toggle: {},
        dependent: {},
        other: {},
      },
      rules: [
        enabledWhen<TestFields, TestContext>('dependent', (_values, context) => context.plan === 'pro', {
          reason: 'pro plan required',
        }),
      ],
    })

    const recommendations = ump.flag(
      { values: { dependent: 'kept' }, context: { plan: 'pro' } },
      { values: { dependent: 'kept' }, context: { plan: 'basic' } },
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
        enabledWhen<TestFields, TestContext>('dependent', (values) => values.toggle === true),
        enabledWhen<TestFields, TestContext>('other', (values) => values.toggle === true),
      ],
    })

    const before = { values: { toggle: true, dependent: 'stale', other: '12:00' } }
    const after = { values: { toggle: false, dependent: 'stale', other: '12:00' } }
    const recommendations = ump.flag(before, after)

    const resetValues = { ...after.values }
    for (const recommendation of recommendations) {
      resetValues[recommendation.field] = recommendation.suggestedValue
    }

    expect(recommendations).toHaveLength(2)
    expect(
      ump.flag(after, {
        values: resetValues,
      }),
    ).toEqual([])
  })
})
