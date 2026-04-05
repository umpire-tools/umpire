import { field } from '../src/field.js'
import { fairWhen, requires } from '../src/rules.js'
import { scorecard } from '../src/scorecard.js'
import { umpire } from '../src/umpire.js'

describe('scorecard', () => {
  test('exposes structural field and transition state from a compiled umpire', () => {
    const sharedRam = ['ddr5-kit']
    const ump = umpire({
      fields: {
        cpu: field<string>().required().isEmpty((value) => !value),
        motherboard: field<string>().required().isEmpty((value) => !value),
        ram: field<string[]>().required().isEmpty((value) => !value || value.length === 0),
      },
      rules: [
        fairWhen('motherboard', (value, values) => value === values.cpu, {
          reason: 'Motherboard no longer matches the selected CPU',
        }),
        requires('ram', 'motherboard', {
          reason: 'Pick a valid motherboard first',
        }),
      ],
    })

    const before = {
      values: {
        cpu: 'am5',
        motherboard: 'am5',
        ram: sharedRam,
      },
    }
    const after = {
      values: {
        cpu: 'lga1700',
        motherboard: 'am5',
        ram: sharedRam,
      },
    }

    const card = ump.scorecard(after, { before })

    expect(card.transition.changedFields).toEqual(['cpu'])
    expect(card.transition.fouledFields).toEqual(['motherboard', 'ram'])
    expect(card.transition.directlyFouledFields).toEqual([])
    expect(card.transition.cascadingFields).toEqual(['motherboard', 'ram'])

    expect(card.fields.cpu).toMatchObject({
      present: true,
      satisfied: true,
      enabled: true,
      fair: true,
      changed: true,
      cascaded: false,
      foul: null,
    })
    expect(card.fields.motherboard).toMatchObject({
      present: true,
      satisfied: true,
      enabled: true,
      fair: false,
      changed: false,
      cascaded: true,
      reason: 'Motherboard no longer matches the selected CPU',
    })
    expect(card.fields.ram).toMatchObject({
      present: true,
      satisfied: true,
      enabled: false,
      fair: true,
      changed: false,
      cascaded: true,
      reason: 'Pick a valid motherboard first',
    })
    expect(card.fields.ram.foul).toEqual({
      field: 'ram',
      reason: 'Pick a valid motherboard first',
      suggestedValue: undefined,
    })
  })

  test('uses compiled field definitions to compute satisfied without extra options', () => {
    const ump = umpire({
      fields: {
        tags: field<string[]>().isEmpty((value) => !value || value.length === 0),
      },
      rules: [],
    })

    const card = ump.scorecard({
      values: {
        tags: [],
      },
    })

    expect(card.fields.tags.present).toBe(true)
    expect(card.fields.tags.satisfied).toBe(false)
  })

  test('top-level helper delegates to the compiled umpire scorecard', () => {
    const ump = umpire({
      fields: {
        cpu: {},
        motherboard: {},
      },
      rules: [
        fairWhen('motherboard', (value, values) => value === values.cpu, {
          reason: 'Motherboard no longer matches the selected CPU',
        }),
      ],
    })

    const snapshot = {
      values: {
        cpu: 'am5',
        motherboard: 'lga1700',
      },
    }

    expect(scorecard(ump, snapshot)).toEqual(ump.scorecard(snapshot))
  })

  test('includes challenge traces only when requested', () => {
    const ump = umpire({
      fields: {
        cpu: {},
        motherboard: {},
      },
      rules: [
        fairWhen('motherboard', (value, values) => value === values.cpu, {
          reason: 'Motherboard no longer matches the selected CPU',
        }),
      ],
    })

    const snapshot = {
      values: {
        cpu: 'am5',
        motherboard: 'lga1700',
      },
    }

    expect(ump.scorecard(snapshot).fields.motherboard.trace).toBeUndefined()
    expect(ump.scorecard(snapshot, { includeChallenge: true }).fields.motherboard.trace).toEqual(
      expect.objectContaining({
        field: 'motherboard',
        fair: false,
      }),
    )
  })
})
