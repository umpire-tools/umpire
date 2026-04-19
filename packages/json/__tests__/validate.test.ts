import { validateSchema } from '../src/index.js'
import type { UmpireJsonSchema } from '../src/index.js'

describe('validateSchema', () => {
  test.each([
    [
      'rejects unsupported schema versions',
      {
        version: 2,
        fields: {},
        rules: [],
      },
      'Unsupported schema version "2"',
    ],
    [
      'rejects non-serializable defaults',
      {
        version: 1,
        fields: {
          profile: {
            default: { theme: 'night' },
          },
        },
        rules: [],
      },
      'Field "profile" has a non-serializable default value',
    ],
    [
      'rejects unknown emptiness strategies',
      {
        version: 1,
        fields: {
          starter: {
            isEmpty: 'mystery',
          },
        },
        rules: [],
      },
      'Unknown isEmpty strategy "mystery"',
    ],
    [
      'rejects excluded rules without a type',
      {
        version: 1,
        fields: {},
        rules: [],
        excluded: [
          {
            type: '',
            description: 'legacy metadata',
          },
        ],
      },
      'Excluded rules must include a non-empty string type',
    ],
    [
      'rejects excluded rules with a non-string field',
      {
        version: 1,
        fields: {},
        rules: [],
        excluded: [
          {
            type: 'custom',
            field: 7,
            description: 'legacy metadata',
          },
        ],
      },
      'Excluded rule field must be a string when provided',
    ],
    [
      'rejects excluded rules without a description',
      {
        version: 1,
        fields: {},
        rules: [],
        excluded: [
          {
            type: 'custom',
            description: '',
          },
        ],
      },
      'Excluded rules must include a non-empty string description',
    ],
    [
      'rejects excluded rules with a non-string key',
      {
        version: 1,
        fields: {},
        rules: [],
        excluded: [
          {
            type: 'custom',
            description: 'legacy metadata',
            key: 42,
          },
        ],
      },
      'Excluded rule key must be a string when provided',
    ],
    [
      'rejects excluded rules with a non-string signature',
      {
        version: 1,
        fields: {},
        rules: [],
        excluded: [
          {
            type: 'custom',
            description: 'legacy metadata',
            signature: false,
          },
        ],
      },
      'Excluded rule signature must be a string when provided',
    ],
    [
      'rejects references to unknown fields',
      {
        version: 1,
        fields: {
          starter: {},
        },
        rules: [
          {
            type: 'disables',
            source: 'unknownField',
            targets: ['starter'],
          },
        ],
      },
      'references unknown field "unknownField"',
    ],
    [
      'rejects empty requires dependency arrays',
      {
        version: 1,
        fields: {
          starter: {},
        },
        rules: [
          {
            type: 'requires',
            field: 'starter',
            dependencies: [],
          },
        ],
      },
      '"requires" rules with dependencies must include at least one entry',
    ],
    [
      'rejects unknown rule types',
      {
        version: 1,
        fields: {},
        rules: [
          {
            type: 'mystery',
          },
        ],
      },
      'Unknown rule type "mystery"',
    ],
    [
      'rejects empty anyOf rules',
      {
        version: 1,
        fields: {
          submit: {},
        },
        rules: [
          {
            type: 'anyOf',
            rules: [],
          },
        ],
      },
      'anyOf() requires at least one rule',
    ],
    [
      'rejects mixed anyOf constraints',
      {
        version: 1,
        fields: {
          submit: {},
          email: {},
          password: {},
        },
        rules: [
          {
            type: 'anyOf',
            rules: [
              {
                type: 'enabledWhen',
                field: 'submit',
                when: { op: 'present', field: 'email' },
              },
              {
                type: 'fairWhen',
                field: 'submit',
                when: { op: 'present', field: 'password' },
              },
            ],
          },
        ],
      },
      'anyOf() cannot mix fairWhen rules with availability rules',
    ],
    [
      'rejects eitherOf without branches',
      {
        version: 1,
        fields: {
          submit: {},
        },
        rules: [
          {
            type: 'eitherOf',
            group: 'auth',
            branches: {},
          },
        ],
      },
      'eitherOf("auth") must include at least one branch',
    ],
    [
      'rejects empty eitherOf branches',
      {
        version: 1,
        fields: {
          submit: {},
        },
        rules: [
          {
            type: 'eitherOf',
            group: 'auth',
            branches: {
              password: [],
            },
          },
        ],
      },
      'eitherOf("auth") branch "password" must not be empty',
    ],
    [
      'rejects mixed eitherOf constraints',
      {
        version: 1,
        fields: {
          submit: {},
          email: {},
          password: {},
        },
        rules: [
          {
            type: 'eitherOf',
            group: 'auth',
            branches: {
              password: [
                {
                  type: 'enabledWhen',
                  field: 'submit',
                  when: { op: 'present', field: 'email' },
                },
              ],
              override: [
                {
                  type: 'fairWhen',
                  field: 'submit',
                  when: { op: 'present', field: 'password' },
                },
              ],
            },
          },
        ],
      },
      'eitherOf("auth") cannot mix fairWhen rules with availability rules',
    ],
    [
      'rejects eitherOf rules that target different fields',
      {
        version: 1,
        fields: {
          submit: {},
          password: {},
          email: {},
        },
        rules: [
          {
            type: 'eitherOf',
            group: 'auth',
            branches: {
              password: [
                {
                  type: 'enabledWhen',
                  field: 'submit',
                  when: { op: 'present', field: 'email' },
                },
              ],
              confirm: [
                {
                  type: 'enabledWhen',
                  field: 'password',
                  when: { op: 'present', field: 'email' },
                },
              ],
            },
          },
        ],
      },
      'eitherOf("auth") rules must target the same fields',
    ],
    [
      'rejects validators that reference unknown fields',
      {
        version: 1,
        fields: {},
        rules: [],
        validators: {
          email: {
            op: 'email',
          },
        },
      },
      'Validator references unknown field "email"',
    ],
    [
      'rejects validators with non-string errors',
      {
        version: 1,
        fields: {
          email: {},
        },
        rules: [],
        validators: {
          email: {
            op: 'email',
            error: 7,
          },
        },
      },
      'Validator for field "email" must use a string error when provided',
    ],
  ])('%s', (_label, schema, expectedMessage) => {
    expect(() =>
      validateSchema(schema as unknown as UmpireJsonSchema),
    ).toThrow(expectedMessage)
  })

  test('accepts nested anyOf/eitherOf composites with matching targets and constraints', () => {
    expect(() =>
      validateSchema({
        version: 1,
        fields: {
          submit: {},
          email: {},
          password: {},
          ssoToken: {},
        },
        rules: [
          {
            type: 'anyOf',
            rules: [
              {
                type: 'eitherOf',
                group: 'auth',
                branches: {
                  password: [
                    {
                      type: 'enabledWhen',
                      field: 'submit',
                      when: { op: 'present', field: 'email' },
                    },
                  ],
                  sso: [
                    {
                      type: 'enabledWhen',
                      field: 'submit',
                      when: { op: 'present', field: 'ssoToken' },
                    },
                  ],
                },
              },
              {
                type: 'enabledWhen',
                field: 'submit',
                when: { op: 'present', field: 'password' },
              },
            ],
          },
        ],
      }),
    ).not.toThrow()
  })
})
