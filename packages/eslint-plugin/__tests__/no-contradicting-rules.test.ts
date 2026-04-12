import { RuleTester } from 'eslint'
import rule from '../src/rules/no-contradicting-rules.js'

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

tester.run('no-contradicting-rules', rule, {
  valid: [
    // No relationship between requires and disables targets.
    {
      code: `
        const ump = umpire({
          fields: { user: {}, order: {}, note: {} },
          rules: [
            requires('order', 'user'),
            disables('note', ['user']),
          ],
        })
      `,
    },
    // requires(A, B) + disables(A, [C]) — A disables an unrelated field, fine.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {}, c: {} },
          rules: [
            requires('a', 'b'),
            disables('a', ['c']),
          ],
        })
      `,
    },
    // requires(A, B) + disables(C, [A]) — C disables A, but A doesn't require C.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {}, c: {} },
          rules: [
            requires('a', 'b'),
            disables('c', ['a']),
          ],
        })
      `,
    },
    // disables with predicate source — skip (can't statically analyze).
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {} },
          rules: [
            requires('a', 'b'),
            disables((v) => !!v.b, ['a']),
          ],
        })
      `,
    },
    // Not an umpire() call — ignore.
    {
      code: `
        const x = configure({
          fields: { a: {}, b: {} },
          rules: [requires('a', 'b'), disables('b', ['a'])],
        })
      `,
    },
  ],

  invalid: [
    // Case A: dep disables the requiring field.
    // requires(order, user) + disables(user, [order]) → order stuck
    {
      code: `
        const ump = umpire({
          fields: { user: {}, order: {} },
          rules: [
            requires('order', 'user'),
            disables('user', ['order']),
          ],
        })
      `,
      errors: [
        {
          messageId: 'contradiction',
          data: {
            target: 'order',
            dep: 'user',
            disSource: 'user',
            disTarget: 'order',
          },
        },
      ],
    },
    // Case B: field disables its own dep.
    // requires(order, user) + disables(order, [user]) → order's own requirement fails
    {
      code: `
        const ump = umpire({
          fields: { user: {}, order: {} },
          rules: [
            requires('order', 'user'),
            disables('order', ['user']),
          ],
        })
      `,
      errors: [
        {
          messageId: 'contradiction',
          data: {
            target: 'order',
            dep: 'user',
            disSource: 'order',
            disTarget: 'user',
          },
        },
      ],
    },
    // requires with multiple deps — all are checked.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {}, c: {} },
          rules: [
            requires('a', 'b', 'c'),
            disables('b', ['a']),
          ],
        })
      `,
      errors: [{ messageId: 'contradiction' }],
    },
    // Both cases present in one config — two errors.
    {
      code: `
        const ump = umpire({
          fields: { a: {}, b: {}, c: {} },
          rules: [
            requires('a', 'b'),
            requires('c', 'b'),
            disables('b', ['a']),
            disables('c', ['b']),
          ],
        })
      `,
      errors: [
        { messageId: 'contradiction' },
        { messageId: 'contradiction' },
      ],
    },
  ],
})
