import {
  anyOf,
  disables,
  enabledWhen,
  isEmptyObject,
  isEmptyString,
  oneOf,
  requires,
} from '@umpire/core'

import { fromJson, hydrateIsEmptyStrategy, toJson } from '../src/index.js'
import type { UmpireJsonSchema } from '../src/index.js'

describe('toJson', () => {
  test('round-trips parsed schemas including top-level conditions and excluded entries', () => {
    const schema: UmpireJsonSchema = {
      version: 1,
      conditions: {
        isBusiness: { type: 'boolean', description: 'Business account gate' },
        validPlans: { type: 'string[]' },
      },
      fields: {
        companyName: {},
        planId: {},
        email: { isEmpty: 'string' },
      },
      rules: [
        {
          type: 'requires',
          field: 'companyName',
          when: { op: 'cond', condition: 'isBusiness' },
          reason: 'Company name is required for business accounts',
        },
        {
          type: 'check',
          field: 'email',
          op: 'email',
        },
        {
          type: 'fairWhen',
          field: 'planId',
          when: { op: 'fieldInCond', field: 'planId', condition: 'validPlans' },
          reason: 'Selected plan is not available for this account',
        },
      ],
      excluded: [
        {
          type: 'custom',
          field: 'planId',
          description: 'Carry forward prior unsupported rule metadata',
        },
      ],
    }

    const parsed = fromJson(schema)

    expect(toJson(parsed)).toEqual(schema)
  })

  test('serializes structural hand-written rules and collects unsupported pieces in excluded', () => {
    const fields = {
      email: { required: true, isEmpty: isEmptyString },
      username: {},
      password: {},
      submit: {},
      mode: {},
      settings: { isEmpty: isEmptyObject },
      extra: { isEmpty: (value: unknown) => value == null || value === '' },
      profile: { default: { theme: 'dark' } as unknown as never },
    }
    const rules = [
      requires<typeof fields>('submit', 'email', 'username', {
        reason: 'Need an identity field',
      }),
      disables<typeof fields>('mode', ['submit']),
      oneOf<typeof fields>('accessMode', {
        credential: ['email', 'password'],
        account: ['username'],
      }),
      anyOf<typeof fields>(
        requires('submit', 'email'),
        requires('submit', 'username'),
      ),
      enabledWhen<typeof fields>('submit', (values) => values.mode === 'open'),
    ]

    expect(toJson({ fields, rules })).toEqual({
      version: 1,
      fields: {
        email: { required: true, isEmpty: 'string' },
        username: {},
        password: {},
        submit: {},
        mode: {},
        settings: { isEmpty: 'object' },
        extra: {},
        profile: {},
      },
      rules: [
        {
          type: 'requires',
          field: 'submit',
          dependency: 'email',
          reason: 'Need an identity field',
        },
        {
          type: 'requires',
          field: 'submit',
          dependency: 'username',
          reason: 'Need an identity field',
        },
        {
          type: 'disables',
          source: 'mode',
          targets: ['submit'],
        },
        {
          type: 'oneOf',
          group: 'accessMode',
          branches: {
            credential: ['email', 'password'],
            account: ['username'],
          },
        },
        {
          type: 'anyOf',
          rules: [
            { type: 'requires', field: 'submit', dependency: 'email' },
            { type: 'requires', field: 'submit', dependency: 'username' },
          ],
        },
      ],
      excluded: [
        {
          type: 'field:isEmpty',
          field: 'extra',
          description: 'Field isEmpty uses a custom function and cannot be serialized',
          signature: '(value) => boolean',
        },
        {
          type: 'field:default',
          field: 'profile',
          description: 'Field default is not a JSON primitive and cannot be serialized',
        },
        {
          type: 'enabledWhen',
          field: 'submit',
          description: 'enabledWhen() predicates are only serializable when hydrated from JSON',
        },
      ],
    })
  })
})
