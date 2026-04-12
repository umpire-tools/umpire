import { RuleTester } from 'eslint'
import rule from '../src/rules/no-self-disable.js'

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

tester.run('no-self-disable', rule, {
  valid: [
    // Source and targets are all different.
    {
      code: `disables('toggle', ['target', 'other'])`,
    },
    // Source is a predicate function — no string to compare.
    {
      code: `disables((v) => v.toggle, ['toggle'])`,
    },
    // Source is check() helper — string is inside, not the source arg itself.
    {
      code: `disables(check('toggle', (v) => !!v), ['target'])`,
    },
    // Empty targets array.
    {
      code: `disables('field', [])`,
    },
    // Not a disables() call — ignore.
    {
      code: `requires('a', 'b')`,
    },
  ],

  invalid: [
    // Source appears as the only target.
    {
      code: `disables('toggle', ['toggle'])`,
      errors: [{ messageId: 'selfDisable', data: { field: 'toggle' } }],
    },
    // Source is one of multiple targets.
    {
      code: `disables('toggle', ['other', 'toggle'])`,
      errors: [{ messageId: 'selfDisable', data: { field: 'toggle' } }],
    },
  ],
})
