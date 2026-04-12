import { RuleTester } from 'eslint'
import rule from '../src/rules/no-circular-requires.js'

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

tester.run('no-circular-requires', rule, {
  valid: [
    // Linear chain — no cycle.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {}, c: {} },
          rules: [
            requires('b', 'a'),
            requires('c', 'b'),
          ],
        })
      `,
    },
    // Diamond dependency — no cycle (a and b both require c).
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {}, c: {} },
          rules: [
            requires('a', 'c'),
            requires('b', 'c'),
          ],
        })
      `,
    },
    // No requires rules at all.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {} },
          rules: [disables('a', ['b'])],
        })
      `,
    },
    // Non-string dep (field builder) — skip.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {} },
          rules: [requires(field('a'), 'b')],
        })
      `,
    },
    // Not an umpire() call — ignore.
    {
      code: `
        const x = configure({
          fields: { a: {}, b: {} },
          rules: [requires('a', 'b'), requires('b', 'a')],
        })
      `,
    },
  ],

  invalid: [
    // Direct 2-node cycle: a ↔ b.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {} },
          rules: [
            requires('a', 'b'),
            requires('b', 'a'),
          ],
        })
      `,
      errors: [{ messageId: 'circular' }],
    },
    // 3-node cycle: a → b → c → a.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {}, c: {} },
          rules: [
            requires('a', 'b'),
            requires('b', 'c'),
            requires('c', 'a'),
          ],
        })
      `,
      errors: [{ messageId: 'circular' }],
    },
    // Self-cycle: a requires itself.
    {
      code: `
        const ump = umpire({
          fields: { a: {} },
          rules: [requires('a', 'a')],
        })
      `,
      errors: [{ messageId: 'circular' }],
    },
    // Two separate 2-node cycles in one config — two errors.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {}, c: {}, d: {} },
          rules: [
            requires('a', 'b'),
            requires('b', 'a'),
            requires('c', 'd'),
            requires('d', 'c'),
          ],
        })
      `,
      errors: [{ messageId: 'circular' }, { messageId: 'circular' }],
    },
    // Cycle message includes the full path.
    {
      code: `
        const ump = umpire({
          fields: { x: {}, y: {} },
          rules: [
            requires('x', 'y'),
            requires('y', 'x'),
          ],
        })
      `,
      errors: [
        {
          messageId: 'circular',
          data: { cycle: "'x' → 'y' → 'x'" },
        },
      ],
    },
  ],
})
