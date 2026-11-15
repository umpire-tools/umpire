import { validateSchema } from '../src/index.js'
import type { UmpireJsonSchema } from '../src/index.js'

describe('validateSchema', () => {
  test.each([
    [
      'rejects unknown top-level members',
      {
        version: 1,
        fields: {
          email: {},
        },
        rules: [],
        unexpected: true,
      },
      'field',
    ],
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
      'rejects empty fields',
      {
        version: 1,
        fields: {},
        rules: [],
      },
      'field',
    ],
    [
      'rejects unknown field members',
      {
        version: 1,
        fields: {
          email: {
            description: 'not part of v1',
          },
        },
        rules: [],
      },
      'field',
    ],
    [
      'rejects unknown condition members',
      {
        version: 1,
        conditions: {
          role: {
            type: 'string',
            unexpected: true,
          },
        },
        fields: {
          target: {},
        },
        rules: [],
      },
      'unexpected',
    ],
    [
      'rejects invalid condition types',
      {
        version: 1,
        conditions: {
          role: {
            type: 'role-name',
          },
        },
        fields: {
          email: {},
        },
        rules: [],
      },
      'condition',
    ],
    [
      'rejects unknown rule members',
      {
        version: 1,
        fields: {
          target: {},
        },
        rules: [
          {
            type: 'enabledWhen',
            field: 'target',
            when: {
              op: 'present',
              field: 'target',
            },
            unexpected: true,
          },
        ],
      },
      'unexpected',
    ],
    [
      'rejects unknown expression members',
      {
        version: 1,
        fields: {
          target: {},
        },
        rules: [
          {
            type: 'enabledWhen',
            field: 'target',
            when: {
              op: 'present',
              field: 'target',
              unexpected: true,
            },
          },
        ],
      },
      'unexpected',
    ],
    [
      'rejects unknown validator members',
      {
        version: 1,
        fields: {
          email: {},
        },
        rules: [],
        validators: {
          email: {
            op: 'email',
            unexpected: true,
          },
        },
      },
      'unexpected',
    ],
    [
      'rejects unknown excluded members',
      {
        version: 1,
        fields: {
          email: {},
        },
        rules: [],
        excluded: [
          {
            type: 'legacy',
            description: 'legacy metadata',
            unexpected: true,
          },
        ],
      },
      'unexpected',
    ],
    [
      'rejects unknown validator spec members',
      {
        version: 1,
        fields: {
          email: {},
        },
        rules: [
          {
            type: 'enabledWhen',
            field: 'email',
            when: {
              op: 'check',
              field: 'email',
              check: {
                op: 'email',
                unexpected: true,
              },
            },
          },
        ],
      },
      'unexpected',
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
    expect(() => validateSchema(schema as unknown as UmpireJsonSchema)).toThrow(
      expectedMessage,
    )
  })

  test.each([
    [
      'rejects non-boolean field required flags',
      { version: 1, fields: { target: { required: 'yes' } }, rules: [] },
      'required must be a boolean',
    ],
    [
      'rejects null condition definitions',
      {
        version: 1,
        conditions: { role: null },
        fields: { target: {} },
        rules: [],
      },
      'condition "role" definition must be an object',
    ],
    [
      'rejects string condition definitions',
      {
        version: 1,
        conditions: { role: 'string' },
        fields: { target: {} },
        rules: [],
      },
      'condition "role" definition must be an object',
    ],
    [
      'rejects enabledWhen rules with non-string fields',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'enabledWhen',
            field: 7,
            when: { op: 'present', field: 'target' },
          },
        ],
      },
      'Rule "enabledWhen" field must be a string',
    ],
    [
      'rejects fairWhen rules with non-string fields',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'fairWhen',
            field: false,
            when: { op: 'present', field: 'target' },
          },
        ],
      },
      'Rule "fairWhen" field must be a string',
    ],
    [
      'rejects check rules with non-string fields',
      {
        version: 1,
        fields: { target: {} },
        rules: [{ type: 'check', field: null, op: 'email' }],
      },
      'Rule "check" field must be a string',
    ],
    [
      'rejects oneOf rules with non-string groups',
      {
        version: 1,
        fields: { target: {} },
        rules: [{ type: 'oneOf', group: 7, branches: { choice: ['target'] } }],
      },
      'Rule "oneOf" group must be a string',
    ],
    [
      'rejects eitherOf rules with non-string groups',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'eitherOf',
            group: false,
            branches: {
              choice: [
                {
                  type: 'enabledWhen',
                  field: 'target',
                  when: { op: 'present', field: 'target' },
                },
              ],
            },
          },
        ],
      },
      'Rule "eitherOf" group must be a string',
    ],
    [
      'rejects non-primitive equality values',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'enabledWhen',
            field: 'target',
            when: { op: 'eq', field: 'target', value: { nested: true } },
          },
        ],
      },
      'must be a JSON primitive',
    ],
    [
      'rejects non-numeric comparison values',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'enabledWhen',
            field: 'target',
            when: { op: 'gt', field: 'target', value: '1' },
          },
        ],
      },
      'must be a finite number',
    ],
    [
      'rejects malformed expression field names',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'enabledWhen',
            field: 'target',
            when: { op: 'present', field: 7 },
          },
        ],
      },
      'field must be a string',
    ],
    [
      'rejects malformed expression value arrays',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'enabledWhen',
            field: 'target',
            when: { op: 'in', field: 'target', values: ['ok', {}] },
          },
        ],
      },
      'array of JSON primitives',
    ],
    [
      'rejects malformed expression lists',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'enabledWhen',
            field: 'target',
            when: { op: 'and', exprs: {} },
          },
        ],
      },
      'exprs must be an array',
    ],
    [
      'rejects unknown expression operators',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'enabledWhen',
            field: 'target',
            when: { op: 'mystery', field: 'target' },
          },
        ],
      },
      'Unknown expression op "mystery"',
    ],
    [
      'rejects non-string rule reasons',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'enabledWhen',
            field: 'target',
            when: { op: 'present', field: 'target' },
            reason: 7,
          },
        ],
      },
      'Rule reason must be a string',
    ],
    [
      'rejects malformed disables targets',
      {
        version: 1,
        fields: { source: {}, target: {} },
        rules: [{ type: 'disables', source: 'source', targets: 'target' }],
      },
      'targets must be an array of strings',
    ],
    [
      'rejects malformed oneOf branches',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'oneOf',
            group: 'choice',
            branches: { choice: 'target' },
          },
        ],
      },
      'branch "choice" must be an array of strings',
    ],
    [
      'rejects malformed eitherOf branches',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'eitherOf',
            group: 'choice',
            branches: { choice: {} },
          },
        ],
      },
      'branch "choice" must be an array',
    ],
    [
      'rejects malformed anyOf rule lists',
      {
        version: 1,
        fields: { target: {} },
        rules: [{ type: 'anyOf', rules: {} }],
      },
      'rules must be an array',
    ],
    [
      'rejects malformed check patterns',
      {
        version: 1,
        fields: { target: {} },
        rules: [
          {
            type: 'check',
            field: 'target',
            op: 'matches',
            pattern: 7,
          },
        ],
      },
      'pattern must be a string',
    ],
    [
      'rejects non-object rule entries',
      { version: 1, fields: { target: {} }, rules: [null] },
      'Rule must be an object',
    ],
    [
      'rejects non-object excluded entries',
      { version: 1, fields: { target: {} }, rules: [], excluded: [null] },
      'Excluded rule must be an object',
    ],
  ])('%s', (_label, schema, expectedMessage) => {
    expect(() => validateSchema(schema as unknown as UmpireJsonSchema)).toThrow(
      expectedMessage,
    )
  })

  test('rejects non-finite JSON numbers supplied as raw objects', () => {
    expect(() =>
      validateSchema({
        version: 1,
        fields: { target: { default: Number.POSITIVE_INFINITY } },
        rules: [],
      }),
    ).toThrow('non-serializable default value')
  })

  test('accepts canonical condition definitions and reason-less oneOf rules', () => {
    expect(() =>
      validateSchema({
        version: 1,
        conditions: {
          role: {
            type: 'string',
            description: 'Current account role',
          },
        },
        fields: {
          email: {},
          phone: {},
        },
        rules: [
          {
            type: 'oneOf',
            group: 'contact',
            branches: {
              email: ['email'],
              phone: ['phone'],
            },
          },
        ],
      }),
    ).not.toThrow()
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

  test('rejects a scalar-field op on an array field under requires "when"', () => {
    expect(() =>
      validateSchema({
        version: 1,
        fields: {
          tags: { isEmpty: 'array' },
          submit: {},
        },
        rules: [
          {
            type: 'requires',
            field: 'submit',
            when: {
              op: 'not',
              expr: { op: 'in', field: 'tags', values: ['urgent'] },
            },
          },
        ],
      }),
    ).toThrow('"in" requires a scalar field')
  })
})
