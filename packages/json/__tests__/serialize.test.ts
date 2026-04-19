import {
  anyOf,
  check,
  disables,
  eitherOf,
  enabledWhen,
  fairWhen,
  isEmptyObject,
  isEmptyString,
  oneOf,
  requires,
  type FieldDef,
  type Rule,
} from '@umpire/core'

import { fromJson, hydrateIsEmptyStrategy, namedValidators, toJson } from '../src/index.js'
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
      validators: {
        email: {
          op: 'email',
          error: 'Must be a valid email address',
        },
      },
      excluded: [
        {
          type: 'custom',
          field: 'planId',
          description: 'Carry forward prior unsupported rule metadata',
          key: 'rule:custom:planId',
        },
      ],
    }

    const parsed = fromJson(schema)

    expect(toJson(parsed)).toEqual(schema)
  })

  test('serializes portable validators and excludes unsupported validator shapes', () => {
    const fields = {
      email: {},
      username: {},
      slug: {},
    }

    expect(toJson({
      fields,
      rules: [],
      validators: {
        email: namedValidators.email(),
        username: {
          validator: namedValidators.minLength(3),
          error: 'Username must be at least 3 characters',
        },
        slug: /^[a-z-]+$/,
      },
    })).toEqual({
      version: 1,
      fields: {
        email: {},
        username: {},
        slug: {},
      },
      rules: [],
      validators: {
        email: {
          op: 'email',
        },
        username: {
          op: 'minLength',
          value: 3,
          error: 'Username must be at least 3 characters',
        },
      },
      excluded: [
        {
          type: 'field:validator',
          field: 'slug',
          description: 'Field validator cannot be serialized unless it uses portable validator metadata from @umpire/json',
          key: 'field:slug:validator',
        },
      ],
    })
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
      requires<typeof fields>('submit', check('email', namedValidators.email()), 'password', {
        reason: 'Need a valid email and password',
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
          type: 'requires',
          field: 'submit',
          dependencies: [
            {
              op: 'check',
              field: 'email',
              check: { op: 'email' },
            },
            'password',
          ],
          reason: 'Need a valid email and password',
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
          key: 'field:extra:isEmpty',
          signature: '(value) => boolean',
        },
        {
          type: 'field:default',
          field: 'profile',
          description: 'Field default is not a JSON primitive and cannot be serialized',
          key: 'field:profile:default',
        },
        {
          type: 'enabledWhen',
          field: 'submit',
          description: 'enabledWhen() predicates are only serializable when hydrated from JSON or when they map to a portable validator',
          key: 'rule:enabledWhen:submit',
        },
      ],
    })
  })

  test('drops carried exclusions when the current config now serializes that slot', () => {
    const parsed = fromJson({
      version: 1,
      fields: {
        email: {},
        username: {},
      },
      rules: [],
      excluded: [
        {
          type: 'field:isEmpty',
          field: 'email',
          description: 'Prior runtime could not serialize email emptiness',
          key: 'field:email:isEmpty',
        },
        {
          type: 'oneOf',
          description: 'Prior runtime could not serialize access mode branching',
          key: 'rule:oneOf:accessMode',
        },
      ],
    })

    expect(toJson({
      fields: {
        ...parsed.fields,
        email: { isEmpty: isEmptyString },
      },
      rules: [
        oneOf('accessMode', {
          account: ['email'],
          handle: ['username'],
        }),
      ],
    })).toEqual({
      version: 1,
      fields: {
        email: { isEmpty: 'string' },
        username: {},
      },
      rules: [
        {
          type: 'oneOf',
          group: 'accessMode',
          branches: {
            account: ['email'],
            handle: ['username'],
          },
        },
      ],
    })
  })

  test('drops carried eitherOf exclusions when the group now serializes', () => {
    const parsed = fromJson({
      version: 1,
      fields: {
        submit: {},
        email: {},
        ssoToken: {},
      },
      rules: [],
      excluded: [
        {
          type: 'eitherOf',
          description: 'Prior runtime could not serialize auth branching',
          key: 'rule:eitherOf:auth',
        },
      ],
    })

    expect(toJson({
      fields: parsed.fields,
      rules: [
        eitherOf('auth', {
          password: [requires('submit', 'email')],
          sso: [requires('submit', 'ssoToken')],
        }),
      ],
    })).toEqual({
      version: 1,
      fields: {
        submit: {},
        email: {},
        ssoToken: {},
      },
      rules: [
        {
          type: 'eitherOf',
          group: 'auth',
          branches: {
            password: [
              {
                type: 'requires',
                field: 'submit',
                dependency: 'email',
              },
            ],
            sso: [
              {
                type: 'requires',
                field: 'submit',
                dependency: 'ssoToken',
              },
            ],
          },
        },
      ],
    })
  })

  test('replaces carried exclusions with current generated exclusions that share a key', () => {
    const parsed = fromJson({
      version: 1,
      fields: {
        extra: {},
      },
      rules: [],
      excluded: [
        {
          type: 'field:isEmpty',
          field: 'extra',
          description: 'Legacy exclusion text',
          key: 'field:extra:isEmpty',
        },
      ],
    })

    expect(toJson({
      fields: {
        ...parsed.fields,
        extra: { isEmpty: (value: unknown) => value == null || value === '' },
      },
      rules: parsed.rules,
    })).toEqual({
      version: 1,
      fields: {
        extra: {},
      },
      rules: [],
      excluded: [
        {
          type: 'field:isEmpty',
          field: 'extra',
          description: 'Field isEmpty uses a custom function and cannot be serialized',
          key: 'field:extra:isEmpty',
          signature: '(value) => boolean',
        },
      ],
    })
  })

  test('dedupes carried exclusions that share the same key', () => {
    const parsed = fromJson({
      version: 1,
      fields: {
        extra: {},
      },
      rules: [],
      excluded: [
        {
          type: 'field:isEmpty',
          field: 'extra',
          description: 'Older exclusion text',
          key: 'field:extra:isEmpty',
        },
        {
          type: 'field:isEmpty',
          field: 'extra',
          description: 'Newer exclusion text',
          key: 'field:extra:isEmpty',
        },
      ],
    })

    expect(toJson(parsed)).toEqual({
      version: 1,
      fields: {
        extra: {},
      },
      rules: [],
      excluded: [
        {
          type: 'field:isEmpty',
          field: 'extra',
          description: 'Newer exclusion text',
          key: 'field:extra:isEmpty',
        },
      ],
    })
  })

  test('excludes eitherOf when inner rules contain non-portable predicates', () => {
    const fields = {
      submit: {},
      email: {},
      ssoToken: {},
    }

    const rule = eitherOf<typeof fields>('auth', {
      password: [
        enabledWhen('submit', (v) => !!v.email, { reason: 'Enter your email' }),
      ],
      sso: [
        enabledWhen('submit', (v) => !!v.ssoToken, { reason: 'No SSO token' }),
      ],
    })

    const result = toJson({ fields, rules: [rule] })

    expect(result.rules).toEqual([])
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'eitherOf',
          description: 'eitherOf() contains inner rules that cannot be serialized one-to-one into JSON',
          key: 'rule:eitherOf:auth',
        }),
      ]),
    )
  })

  test('serializes disables() predicate sources when they map to portable validators', () => {
    const fields = {
      email: {},
      submit: {},
    }

    const result = toJson({
      fields,
      rules: [disables(check('email', namedValidators.email()), ['submit'])],
    })

    expect(result.rules).toEqual([
      {
        type: 'disables',
        when: {
          op: 'check',
          field: 'email',
          check: { op: 'email' },
        },
        targets: ['submit'],
      },
    ])
  })

  test('serializes fairWhen() checks against other fields as check expressions', () => {
    const fields = {
      email: {},
      submit: {},
    }

    const result = toJson({
      fields,
      rules: [fairWhen('submit', check('email', namedValidators.email()))],
    })

    expect(result.rules).toEqual([
      {
        type: 'fairWhen',
        field: 'submit',
        when: {
          op: 'check',
          field: 'email',
          check: { op: 'email' },
        },
      },
    ])
  })

  test('excludes dynamic reason callbacks across rule kinds', () => {
    const fields = {
      email: {},
      submit: {},
      mode: {},
    }

    const result = toJson({
      fields,
      rules: [
        enabledWhen('submit', check('email', namedValidators.email()), { reason: () => 'dynamic' }),
        requires('submit', 'email', { reason: () => 'dynamic' }),
        fairWhen('email', namedValidators.email(), { reason: () => 'dynamic' }),
        disables('mode', ['submit'], { reason: () => 'dynamic' }),
      ],
    })

    expect(result.rules).toEqual([])
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'enabledWhen' }),
        expect.objectContaining({ type: 'requires' }),
        expect.objectContaining({ type: 'fairWhen' }),
        expect.objectContaining({ type: 'disables' }),
      ]),
    )
  })

  test('excludes oneOf overrides and non-serializable anyOf branches', () => {
    const fields = {
      email: {},
      submit: {},
      mode: {},
    }

    const result = toJson({
      fields,
      rules: [
        oneOf('modeSelect', { email: ['email'], submit: ['submit'] }, { activeBranch: 'email' }),
        anyOf(enabledWhen('submit', (values) => values.mode === 'open')),
      ],
    })

    expect(result.rules).toEqual([])
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'oneOf' }),
        expect.objectContaining({ type: 'anyOf' }),
      ]),
    )
  })

  test('excludes rules that cannot be inspected', () => {
    const fields = {
      email: {},
    }

    const opaqueRule = {
      type: 'opaqueRule',
      targets: ['email'],
      sources: [],
      evaluate: () => ({ enabled: true }),
    } as unknown as Rule<Record<string, FieldDef>, Record<string, unknown>>

    const result = toJson({ fields, rules: [opaqueRule] })

    expect(result.rules).toEqual([])
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'opaqueRule',
          description: 'Rule "opaqueRule" could not be inspected for JSON serialization',
        }),
      ]),
    )
  })
})
