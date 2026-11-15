import { expr } from '../src/index.js'

describe('expr builders', () => {
  test('build non-check expressions and clone mutable inputs', () => {
    const allowedLeagues = ['al', 'nl']
    const weatherBands = ['clear', 'windy']
    const slider = { op: 'eq', field: 'pitchType', value: 'slider' } as const
    const curveball = {
      op: 'eq',
      field: 'pitchType',
      value: 'curveball',
    } as const

    const built = {
      neq: expr.neq('pitchType', 'sinker'),
      gt: expr.gt('pitchCount', 80),
      gte: expr.gte('pitchCount', 100),
      lt: expr.lt('pitchCount', 20),
      lte: expr.lte('pitchCount', 10),
      present: expr.present('starter'),
      absent: expr.absent('starter'),
      truthy: expr.truthy('walkSignal'),
      falsy: expr.falsy('walkSignal'),
      in: expr.in('league', allowedLeagues),
      notIn: expr.notIn('league', allowedLeagues),
      contains: expr.contains('lineup', 'Soto'),
      cond: expr.cond('isPlayoffs'),
      condEq: expr.condEq('weatherBand', 'windy'),
      condIn: expr.condIn('weatherBand', weatherBands),
      fieldInCond: expr.fieldInCond('starter', 'availableStarters'),
      and: expr.and(slider, curveball),
      or: expr.or(slider, curveball),
      not: expr.not(slider),
    }

    expect(built).toEqual({
      neq: { op: 'neq', field: 'pitchType', value: 'sinker' },
      gt: { op: 'gt', field: 'pitchCount', value: 80 },
      gte: { op: 'gte', field: 'pitchCount', value: 100 },
      lt: { op: 'lt', field: 'pitchCount', value: 20 },
      lte: { op: 'lte', field: 'pitchCount', value: 10 },
      present: { op: 'present', field: 'starter' },
      absent: { op: 'absent', field: 'starter' },
      truthy: { op: 'truthy', field: 'walkSignal' },
      falsy: { op: 'falsy', field: 'walkSignal' },
      in: { op: 'in', field: 'league', values: ['al', 'nl'] },
      notIn: { op: 'notIn', field: 'league', values: ['al', 'nl'] },
      contains: { op: 'contains', field: 'lineup', value: 'Soto' },
      cond: { op: 'cond', condition: 'isPlayoffs' },
      condEq: { op: 'condEq', condition: 'weatherBand', value: 'windy' },
      condIn: {
        op: 'condIn',
        condition: 'weatherBand',
        values: ['clear', 'windy'],
      },
      fieldInCond: {
        op: 'fieldInCond',
        field: 'starter',
        condition: 'availableStarters',
      },
      and: {
        op: 'and',
        exprs: [
          { op: 'eq', field: 'pitchType', value: 'slider' },
          { op: 'eq', field: 'pitchType', value: 'curveball' },
        ],
      },
      or: {
        op: 'or',
        exprs: [
          { op: 'eq', field: 'pitchType', value: 'slider' },
          { op: 'eq', field: 'pitchType', value: 'curveball' },
        ],
      },
      not: {
        op: 'not',
        expr: { op: 'eq', field: 'pitchType', value: 'slider' },
      },
    })

    allowedLeagues.push('npb')
    weatherBands.push('rain')

    expect(built.in).toEqual({
      op: 'in',
      field: 'league',
      values: ['al', 'nl'],
    })
    expect(built.condIn).toEqual({
      op: 'condIn',
      condition: 'weatherBand',
      values: ['clear', 'windy'],
    })
  })
})
