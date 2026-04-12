import { RuleTester } from 'eslint'
import rule from '../src/rules/no-unknown-fields.js'

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

tester.run('no-unknown-fields', rule, {
  valid: [
    // All fields referenced in rules are declared.
    {
      code: `
        const ump = umpire({
          fields: { username: {}, email: {}, password: {} },
          rules: [
            requires('email', 'username'),
            disables('username', ['email', 'password']),
            enabledWhen('password', (v) => !!v.email),
          ],
        })
      `,
    },
    // oneOf branch fields are all declared.
    {
      code: `
        const ump = umpire({
          fields: { fast: {}, slow: {}, turbo: {} },
          rules: [
            oneOf('mode', { fast: ['fast', 'turbo'], slow: ['slow'] }),
          ],
        })
      `,
    },
    // anyOf with all declared fields.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {}, c: {} },
          rules: [
            anyOf(requires('a', 'b'), requires('a', 'c')),
          ],
        })
      `,
    },
    // check() helper in disables source position.
    {
      code: `
        const ump = umpire({
          fields: { toggle: {}, target: {} },
          rules: [
            disables(check('toggle', (v) => v.toggle === 'on'), ['target']),
          ],
        })
      `,
    },
    // No rules array — nothing to check.
    {
      code: `
        const ump = umpire({ fields: { a: {}, b: {} } })
      `,
    },
    // Spread in fields — bail out to avoid false positives.
    {
      code: `
        const ump = umpire({
          fields: { ...baseFields, extra: {} },
          rules: [requires('anything', 'unknown')],
        })
      `,
    },
    // Not an umpire() call — ignore.
    {
      code: `
        const x = configure({ fields: { a: {} }, rules: [requires('nope', 'a')] })
      `,
    },
    // fairWhen with a declared field.
    {
      code: `
        const ump = umpire({
          fields: { cpu: {}, motherboard: {} },
          rules: [fairWhen('motherboard', (v) => v.cpu === v.motherboard)],
        })
      `,
    },
  ],

  invalid: [
    // Typo in requires target.
    {
      code: `
        const ump = umpire({
          fields: { username: {}, email: {} },
          rules: [requires('usernme', 'email')],
        })
      `,
      errors: [{ messageId: 'unknownField', data: { field: 'usernme' } }],
    },
    // Typo in requires dependency.
    {
      code: `
        const ump = umpire({
          fields: { username: {}, email: {} },
          rules: [requires('username', 'emial')],
        })
      `,
      errors: [{ messageId: 'unknownField', data: { field: 'emial' } }],
    },
    // Unknown field in disables source.
    {
      code: `
        const ump = umpire({
          fields: { toggle: {}, target: {} },
          rules: [disables('toggl', ['target'])],
        })
      `,
      errors: [{ messageId: 'unknownField', data: { field: 'toggl' } }],
    },
    // Unknown field in disables targets.
    {
      code: `
        const ump = umpire({
          fields: { toggle: {}, target: {} },
          rules: [disables('toggle', ['taret'])],
        })
      `,
      errors: [{ messageId: 'unknownField', data: { field: 'taret' } }],
    },
    // Unknown field inside oneOf branch.
    {
      code: `
        const ump = umpire({
          fields: { fast: {}, slow: {} },
          rules: [oneOf('mode', { fast: ['fast'], slow: ['slwo'] })],
        })
      `,
      errors: [{ messageId: 'unknownField', data: { field: 'slwo' } }],
    },
    // Unknown inside anyOf → nested requires.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {} },
          rules: [anyOf(requires('a', 'c'), requires('a', 'b'))],
        })
      `,
      errors: [{ messageId: 'unknownField', data: { field: 'c' } }],
    },
    // Unknown field in check() helper inside disables.
    {
      code: `
        const ump = umpire({
          fields: { toggle: {}, target: {} },
          rules: [disables(check('toogle', (v) => true), ['target'])],
        })
      `,
      errors: [{ messageId: 'unknownField', data: { field: 'toogle' } }],
    },
    // Unknown field in enabledWhen target.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {} },
          rules: [enabledWhen('c', () => true)],
        })
      `,
      errors: [{ messageId: 'unknownField', data: { field: 'c' } }],
    },
    // Unknown field in fairWhen target.
    {
      code: `
        const ump = umpire({
          fields: { cpu: {}, motherboard: {} },
          rules: [fairWhen('mtoherboard', (v) => true)],
        })
      `,
      errors: [{ messageId: 'unknownField', data: { field: 'mtoherboard' } }],
    },
    // Multiple errors in one umpire call.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {} },
          rules: [requires('x', 'y')],
        })
      `,
      errors: [
        { messageId: 'unknownField', data: { field: 'x' } },
        { messageId: 'unknownField', data: { field: 'y' } },
      ],
    },
  ],
})
