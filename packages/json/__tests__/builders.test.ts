import { enabledWhen, umpire } from '@umpire/core'

import {
  anyOfJson,
  createJsonRules,
  namedValidators,
  toJson,
} from '../src/index.js'
import type { UmpireJsonSchema } from '../src/index.js'

describe('portable JSON builders', () => {
  test('builder-authored expr rules serialize to exact JSON', () => {
    const fields = {
      pitchType: {},
      starter: { required: true },
      walkSignal: {},
      warmupNotice: {},
      bullpenCart: {},
      dugoutTablet: {},
    }
    const conditions = {
      isPlayoffs: { type: 'boolean' as const },
      weatherBand: { type: 'string' as const },
      availableStarters: { type: 'string[]' as const },
    }

    type Conditions = {
      isPlayoffs: boolean
      weatherBand: string
      availableStarters: string[]
    }

    const {
      expr,
      enabledWhenExpr,
      fairWhenExpr,
      requiresJson,
      requiresExpr,
      disablesExpr,
      anyOfJson,
    } = createJsonRules<typeof fields, Conditions>()

    const rules = [
      anyOfJson(
        enabledWhenExpr('warmupNotice', expr.eq('pitchType', 'slider'), {
          reason: 'Needs a slider call',
        }),
        enabledWhenExpr('warmupNotice', expr.eq('pitchType', 'curveball'), {
          reason: 'Needs a curveball call',
        }),
      ),
      fairWhenExpr('starter', expr.fieldInCond('starter', 'availableStarters'), {
        reason: 'Starter must be on tonight\'s card',
      }),
      requiresJson(
        'bullpenCart',
        'pitchType',
        expr.check('starter', namedValidators.minLength(4)),
        {
          reason: 'Bullpen cart waits for a pitch call and a full starter name',
        },
      ),
      requiresExpr(
        'bullpenCart',
        expr.fieldInCond('starter', 'availableStarters'),
        {
          reason: 'Bullpen cart waits for an available starter',
        },
      ),
      disablesExpr(
        expr.or(
          expr.condEq('weatherBand', 'windy'),
          expr.truthy('walkSignal'),
        ),
        ['dugoutTablet'],
        {
          reason: 'Review board locked during windy or intentional-walk moments',
        },
      ),
    ]

    const expected: UmpireJsonSchema = {
      version: 1,
      conditions,
      fields: {
        pitchType: {},
        starter: { required: true },
        walkSignal: {},
        warmupNotice: {},
        bullpenCart: {},
        dugoutTablet: {},
      },
      rules: [
        {
          type: 'anyOf',
          rules: [
            {
              type: 'enabledWhen',
              field: 'warmupNotice',
              when: { op: 'eq', field: 'pitchType', value: 'slider' },
              reason: 'Needs a slider call',
            },
            {
              type: 'enabledWhen',
              field: 'warmupNotice',
              when: { op: 'eq', field: 'pitchType', value: 'curveball' },
              reason: 'Needs a curveball call',
            },
          ],
        },
        {
          type: 'fairWhen',
          field: 'starter',
          when: { op: 'fieldInCond', field: 'starter', condition: 'availableStarters' },
          reason: 'Starter must be on tonight\'s card',
        },
        {
          type: 'requires',
          field: 'bullpenCart',
          dependencies: [
            'pitchType',
            {
              op: 'check',
              field: 'starter',
              check: { op: 'minLength', value: 4 },
            },
          ],
          reason: 'Bullpen cart waits for a pitch call and a full starter name',
        },
        {
          type: 'requires',
          field: 'bullpenCart',
          when: { op: 'fieldInCond', field: 'starter', condition: 'availableStarters' },
          reason: 'Bullpen cart waits for an available starter',
        },
        {
          type: 'disables',
          when: {
            op: 'or',
            exprs: [
              { op: 'condEq', condition: 'weatherBand', value: 'windy' },
              { op: 'truthy', field: 'walkSignal' },
            ],
          },
          targets: ['dugoutTablet'],
          reason: 'Review board locked during windy or intentional-walk moments',
        },
      ],
    }

    expect(toJson({ fields, rules, conditions })).toEqual(expected)
  })

  test('builder-authored expr rules execute through core normally', () => {
    const fields = {
      pitchType: {},
      starter: { required: true },
      walkSignal: {},
      warmupNotice: {},
      bullpenCart: {},
      dugoutTablet: {},
    }

    type Conditions = {
      weatherBand: string
      availableStarters: string[]
    }

    const {
      expr,
      enabledWhenExpr,
      fairWhenExpr,
      requiresJson,
      requiresExpr,
      disablesExpr,
      anyOfJson,
    } = createJsonRules<typeof fields, Conditions>()

    const rules = [
      anyOfJson(
        enabledWhenExpr('warmupNotice', expr.eq('pitchType', 'slider'), {
          reason: 'Needs a slider call',
        }),
        enabledWhenExpr('warmupNotice', expr.eq('pitchType', 'curveball'), {
          reason: 'Needs a curveball call',
        }),
      ),
      fairWhenExpr('starter', expr.fieldInCond('starter', 'availableStarters'), {
        reason: 'Starter must be on tonight\'s card',
      }),
      requiresJson(
        'bullpenCart',
        'pitchType',
        expr.check('starter', namedValidators.minLength(4)),
        {
          reason: 'Bullpen cart waits for a pitch call and a full starter name',
        },
      ),
      requiresExpr(
        'bullpenCart',
        expr.fieldInCond('starter', 'availableStarters'),
        {
          reason: 'Bullpen cart waits for an available starter',
        },
      ),
      disablesExpr(
        expr.or(
          expr.condEq('weatherBand', 'windy'),
          expr.truthy('walkSignal'),
        ),
        ['dugoutTablet'],
        {
          reason: 'Review board locked during windy or intentional-walk moments',
        },
      ),
    ]

    const runtime = umpire({
      fields,
      rules,
    })

    expect(runtime.check(
      {
        pitchType: 'slider',
        starter: 'Cole',
        walkSignal: false,
      },
      {
        weatherBand: 'cold',
        availableStarters: ['Cole'],
      },
    )).toMatchObject({
      warmupNotice: { enabled: true, reason: null },
      starter: { fair: true, reason: null },
      bullpenCart: { enabled: true, reason: null },
      dugoutTablet: { enabled: true, reason: null },
    })

    expect(runtime.check(
      {
        pitchType: 'fastball',
        starter: 'Cole',
        walkSignal: true,
      },
      {
        weatherBand: 'windy',
        availableStarters: ['Holmes'],
      },
    )).toMatchObject({
      warmupNotice: { enabled: false, reason: 'Needs a slider call' },
      starter: { fair: false, reason: 'Starter must be on tonight\'s card' },
      bullpenCart: {
        enabled: false,
        reason: 'Bullpen cart waits for an available starter',
      },
      dugoutTablet: {
        enabled: false,
        reason: 'Review board locked during windy or intentional-walk moments',
      },
    })
  })

  test('anyOfJson requires JSON-backed inner rules', () => {
    const fields = {
      warmupNotice: {},
      pitchType: {},
    }

    type Conditions = Record<string, unknown>

    const { expr, enabledWhenExpr } = createJsonRules<typeof fields, Conditions>()

    expect(() =>
      anyOfJson(
        enabledWhenExpr('warmupNotice', expr.eq('pitchType', 'slider')),
        enabledWhen<typeof fields>('warmupNotice', () => true),
      ),
    ).toThrow('anyOfJson() requires every inner rule to carry JSON metadata')
  })

  test('requiresJson supports mixed field and portable-validator dependencies', () => {
    const fields = {
      email: {},
      password: {},
      submit: {},
    }

    const { expr, requiresJson } = createJsonRules<typeof fields>()

    const rule = requiresJson(
      'submit',
      'password',
      expr.check('email', namedValidators.email()),
      {
        reason: 'Need a valid email and password before submit',
      },
    )

    expect(toJson({
      fields,
      rules: [rule],
    })).toEqual({
      version: 1,
      fields: {
        email: {},
        password: {},
        submit: {},
      },
      rules: [
        {
          type: 'requires',
          field: 'submit',
          dependencies: [
            'password',
            {
              op: 'check',
              field: 'email',
              check: { op: 'email' },
            },
          ],
          reason: 'Need a valid email and password before submit',
        },
      ],
    })
  })

  test('fairWhenExpr preserves portable validators for serialization', () => {
    const fields = {
      email: {},
      submit: {},
    }

    const { expr, fairWhenExpr } = createJsonRules<typeof fields>()

    const rule = fairWhenExpr('submit', expr.check('email', namedValidators.email()), {
      reason: 'Submit stays foul until the scorer email is valid',
    })

    expect(toJson({
      fields,
      rules: [rule],
    })).toEqual({
      version: 1,
      fields: {
        email: {},
        submit: {},
      },
      rules: [
        {
          type: 'fairWhen',
          field: 'submit',
          when: {
            op: 'check',
            field: 'email',
            check: { op: 'email' },
          },
          reason: 'Submit stays foul until the scorer email is valid',
        },
      ],
    })
  })

  test('expr helpers build portable JSON and clone mutable inputs', () => {
    const { expr } = createJsonRules<Record<string, {}>>()
    const allowedLeagues = ['al', 'nl']
    const weatherBands = ['clear', 'windy']
    const slider = { op: 'eq', field: 'pitchType', value: 'slider' } as const
    const curveball = { op: 'eq', field: 'pitchType', value: 'curveball' } as const

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
      cond: { op: 'cond', condition: 'isPlayoffs' },
      condEq: { op: 'condEq', condition: 'weatherBand', value: 'windy' },
      condIn: { op: 'condIn', condition: 'weatherBand', values: ['clear', 'windy'] },
      fieldInCond: { op: 'fieldInCond', field: 'starter', condition: 'availableStarters' },
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

  test('expr.check rejects non-portable validators', () => {
    const { expr } = createJsonRules<Record<string, {}>>()

    expect(() =>
      expr.check('starter', {
        __check: 'custom',
        validate: () => true,
      } as Parameters<typeof expr.check>[1]),
    ).toThrow('expr.check() requires a portable validator from @umpire/json')
  })

  test('requiresJson requires at least one dependency', () => {
    const { requiresJson } = createJsonRules<Record<string, {}>>()

    expect(() =>
      requiresJson('bullpenCart'),
    ).toThrow('requiresJson("bullpenCart") requires at least one dependency')
  })
})
