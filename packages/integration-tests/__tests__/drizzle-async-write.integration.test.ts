import { describe, expect, it } from 'bun:test'
import { enabledWhen, requires } from '@umpire/core'
import {
  enabledWhen as enabledWhenAsync,
  requires as requiresAsync,
} from '@umpire/async'
import { createAsyncDrizzlePolicy, createDrizzlePolicy } from '@umpire/drizzle'
import type { AsyncWriteValidationAdapter } from '@umpire/write'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const accounts = sqliteTable('async_write_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountType: text('account_type').notNull().default('personal'),
  companyName: text('company_name'),
  discountCode: text('discount_code'),
})

function buildSyncPolicy() {
  return createDrizzlePolicy(accounts, {
    fields: { companyName: { required: true } },
    rules: [
      requires('companyName', (values) => values.accountType === 'business'),
      enabledWhen('discountCode', (_values, context) =>
        Boolean(context.allowDiscounts),
      ),
    ],
  })
}

function buildAsyncPolicy() {
  return createAsyncDrizzlePolicy(accounts, {
    fields: { companyName: { required: true } },
    rules: [
      requiresAsync(
        'companyName',
        async (values) => values.accountType === 'business',
      ),
      enabledWhenAsync('discountCode', async (_values, context) =>
        Boolean(context.allowDiscounts),
      ),
    ],
  })
}

describe('drizzle async write integration', () => {
  it('async policy matches sync create behavior while awaiting rules', async () => {
    const syncResult = buildSyncPolicy().checkCreate(
      {
        accountType: 'personal',
        companyName: 'Acme',
        discountCode: 'SAVE10',
      },
      { context: { allowDiscounts: false } },
    )
    const asyncResult = await buildAsyncPolicy().checkCreate(
      {
        accountType: 'personal',
        companyName: 'Acme',
        discountCode: 'SAVE10',
      },
      { context: { allowDiscounts: false } },
    )

    expect(asyncResult.ok).toBe(syncResult.ok)
    expect(asyncResult.data).toEqual(syncResult.data)
    expect(asyncResult.issues.rules).toEqual(syncResult.issues.rules)
  })

  it('async policy matches sync patch stale-clear behavior', async () => {
    const existing = {
      accountType: 'business',
      companyName: 'Acme',
      discountCode: 'SAVE10',
    }
    const patch = { accountType: 'personal' }
    const context = { allowDiscounts: true }

    const syncResult = buildSyncPolicy().checkPatch(existing, patch, {
      context,
    })
    const asyncResult = await buildAsyncPolicy().checkPatch(existing, patch, {
      context,
    })

    expect(asyncResult.ok).toBe(syncResult.ok)
    expect(asyncResult.data).toEqual(syncResult.data)
    expect(asyncResult.issues.rules).toEqual(syncResult.issues.rules)
  })

  it('async policy awaits async validation adapters', async () => {
    const validation: AsyncWriteValidationAdapter<Record<string, any>> = {
      async run() {
        await Promise.resolve()
        return {
          errors: { companyName: 'Company name is not allowed' },
          normalizedErrors: [
            {
              field: 'companyName',
              message: 'Company name is not allowed',
            },
          ],
          result: { success: false },
          schemaFields: ['companyName'],
        }
      },
    }

    const result = await buildAsyncPolicy().checkCreate(
      {
        accountType: 'business',
        companyName: 'Blocked LLC',
      },
      { validation },
    )

    expect(result.ok).toBe(false)
    expect(result.issues.schema).toEqual([
      { field: 'companyName', message: 'Company name is not allowed' },
    ])
  })
})
