import { RuleTester } from 'eslint'
import rule from '../src/rules/no-write-owned-fields.js'

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

tester.run('no-write-owned-fields', rule, {
  valid: [
    {
      code: `
        checkCreate(userUmp, { email: 'a@example.com' })
        checkPatch(userUmp, prev, { email: 'b@example.com' })
      `,
    },
    {
      code: `
        fromDrizzleTable(users, { exclude: ['id'] })
      `,
    },
    {
      code: `
        fromDrizzleModel({
          account: { table: accounts, exclude: ['id'] },
          billing: { table: billingProfiles, exclude: ['id'] },
        })
      `,
    },
    {
      code: `
        checkCreate(userUmp, { id: 'allowed' })
        fromDrizzleTable(users)
      `,
      options: [{ fieldNames: ['createdAt'], checkDrizzleHelpers: false }],
    },
    {
      code: `
        fromDrizzleTable(users)
      `,
      options: [{ checkDrizzleHelpers: false }],
    },
    {
      code: `
        checkCreate(userUmp, { id: 'server-owned' })
      `,
      options: [{ checkWriteCandidates: false }],
    },
    {
      code: `
        validateCreate(userUmp, { email: 'a@example.com' })
      `,
      options: [{ writeHelpers: ['validateCreate'] }],
    },
    {
      code: `
        fromDrizzleTable(users, dynamicOptions)
        checkCreate(userUmp, candidate)
      `,
    },
    {
      code: `
        fromDrizzleModel(model)
      `,
    },
    {
      code: `
        hydrateDrizzleModel({ account: { table: accounts, exclude: ['id'] } })
      `,
      options: [{ drizzleHelpers: ['hydrateDrizzleModel'] }],
    },
  ],

  invalid: [
    {
      code: `
        checkCreate(userUmp, { id: 'client-value', email: 'a@example.com' })
      `,
      errors: [
        {
          messageId: 'ownedWriteField',
          data: { helper: 'checkCreate', field: 'id' },
        },
      ],
    },
    {
      code: `
        checkCreate(userUmp, { ...base, id: 'client-value' })
      `,
      errors: [
        {
          messageId: 'ownedWriteField',
          data: { helper: 'checkCreate', field: 'id' },
        },
      ],
    },
    {
      code: `
        checkPatch(userUmp, prev, { id: 'client-value' })
      `,
      errors: [
        {
          messageId: 'ownedWriteField',
          data: { helper: 'checkPatch', field: 'id' },
        },
      ],
    },
    {
      code: `
        checkCreate(userUmp, { id: 'client-value', createdAt: new Date() })
      `,
      options: [{ fieldNames: ['id', 'createdAt'] }],
      errors: [
        {
          messageId: 'ownedWriteField',
          data: { helper: 'checkCreate', field: 'id' },
        },
        {
          messageId: 'ownedWriteField',
          data: { helper: 'checkCreate', field: 'createdAt' },
        },
      ],
    },
    {
      code: `
        fromDrizzleTable(users)
      `,
      errors: [
        {
          messageId: 'missingExclude',
          data: { helper: 'fromDrizzleTable', field: 'id' },
        },
      ],
    },
    {
      code: `
        fromDrizzleTable(users, { exclude: ['createdAt'] })
      `,
      errors: [
        {
          messageId: 'missingExclude',
          data: { helper: 'fromDrizzleTable', field: 'id' },
        },
      ],
    },
    {
      code: `
        fromDrizzleModel({
          account: accounts,
          billing: { table: billingProfiles, exclude: ['id'] },
        })
      `,
      errors: [
        {
          messageId: 'missingExclude',
          data: { helper: 'fromDrizzleModel', field: 'id' },
        },
      ],
    },
    {
      code: `
        fromDrizzleModel({
          account: { table: accounts, exclude: ['createdAt'] },
        })
      `,
      errors: [
        {
          messageId: 'missingExclude',
          data: { helper: 'fromDrizzleModel', field: 'id' },
        },
      ],
    },
    {
      code: `
        validateCreate(userUmp, { id: 'client-value' })
      `,
      options: [{ writeHelpers: ['validateCreate'] }],
      errors: [
        {
          messageId: 'ownedWriteField',
          data: { helper: 'validateCreate', field: 'id' },
        },
      ],
    },
    {
      code: `
        hydrateDrizzleModel({ account: accounts })
      `,
      options: [{ drizzleHelpers: ['hydrateDrizzleModel'] }],
      errors: [
        {
          messageId: 'missingExclude',
          data: { helper: 'hydrateDrizzleModel', field: 'id' },
        },
      ],
    },
  ],
})
