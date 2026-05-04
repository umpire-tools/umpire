import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { InferInsertModel } from 'drizzle-orm'
import { enabledWhen, requires } from '@umpire/core'
import { createZodAdapter } from '@umpire/zod'
import { z } from 'zod'
import { createDrizzleModelPolicy } from '@umpire/drizzle'

// ── SQLite harness ──

function createMemoryDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle({ client: sqlite })
  return { db, sqlite, close: () => sqlite.close() }
}

// ── Model tables ──

const quoteAccounts = sqliteTable('quote_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountType: text('account_type').notNull().default('personal'),
  companyName: text('company_name'),
})

const quoteShipments = sqliteTable('quote_shipments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull(),
  hazardous: integer('hazardous', { mode: 'boolean' }).notNull().default(false),
  hazClass: text('haz_class'),
  serviceLevel: text('service_level').notNull().default('standard'),
})

type QuoteAccount = InferInsertModel<typeof quoteAccounts>
type QuoteShipment = InferInsertModel<typeof quoteShipments>

function createSchema(db: ReturnType<typeof createMemoryDb>['sqlite']) {
  db.run(`
    CREATE TABLE quote_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_type TEXT NOT NULL DEFAULT 'personal',
      company_name TEXT
    )
  `)
  db.run(`
    CREATE TABLE quote_shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      hazardous INTEGER NOT NULL DEFAULT 0,
      haz_class TEXT,
      service_level TEXT NOT NULL DEFAULT 'standard'
    )
  `)
}

// ── Zod field schemas ──

const modelSchemas = {
  'account.accountType': z.enum(['personal', 'business']),
  'account.companyName': z.string().min(1, 'Company name is required'),
  'shipment.hazardous': z.boolean(),
  'shipment.hazClass': z.enum([
    'class1_explosives',
    'class2_gases',
    'class3_flammable',
  ]),
  'shipment.serviceLevel': z.enum(['standard', 'expedited', 'overnight']),
}

// ── Policy builder ──

function buildModelPolicy() {
  return createDrizzleModelPolicy(
    {
      account: quoteAccounts,
      shipment: { table: quoteShipments, exclude: ['accountId'] },
    },
    {
      fields: {
        'account.companyName': { required: true },
      },
      rules: [
        requires('account.companyName', (v) => {
          return v['account.accountType'] === 'business'
        }),
        requires('shipment.hazClass', (v) => v['shipment.hazardous'] === true),
        enabledWhen(
          'shipment.serviceLevel',
          (_v, c) => !Boolean(c.promoActive),
        ),
      ],
      validation: createZodAdapter({
        schemas: modelSchemas,
        rejectFoul: true,
      }),
    },
  )
}

// ── Tests ──

describe('drizzle sqlite model policy multi-table write', () => {
  // ── Model create ──

  it('model create returns per-table payloads that write to real db', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      createSchema(sqlite)

      const policy = buildModelPolicy()
      const result = policy.checkCreate({
        'account.accountType': 'business',
        'account.companyName': 'Acme Logistics',
        'shipment.hazardous': true,
        'shipment.hazClass': 'class3_flammable',
        'shipment.serviceLevel': 'standard',
      })

      expect(result.ok).toBe(true)
      expect(result.dataByTable).toBeDefined()
      expect(result.dataByTable.account).toBeDefined()
      expect(result.dataByTable.shipment).toBeDefined()

      // Insert account first to get the id
      const accountRow = db
        .insert(quoteAccounts)
        .values(result.dataByTable.account as QuoteAccount)
        .returning()
        .get()

      expect(accountRow!.id).toBeGreaterThan(0)
      expect(accountRow!.accountType).toBe('business')
      expect(accountRow!.companyName).toBe('Acme Logistics')

      // Insert shipment with the returned account id
      const shipmentRow = db
        .insert(quoteShipments)
        .values({
          ...(result.dataByTable.shipment as QuoteShipment),
          accountId: accountRow!.id,
        })
        .returning()
        .get()

      expect(shipmentRow!.id).toBeGreaterThan(0)
      expect(shipmentRow!.accountId).toBe(accountRow!.id)
      expect(shipmentRow!.hazardous).toBe(true)
      expect(shipmentRow!.hazClass).toBe('class3_flammable')
      expect(shipmentRow!.serviceLevel).toBe('standard')
    } finally {
      close()
    }
  })

  it('model create blocks when required conditional field missing', () => {
    const { sqlite, close } = createMemoryDb()
    try {
      createSchema(sqlite)

      const policy = buildModelPolicy()
      const result = policy.checkCreate({
        'account.accountType': 'business',
        // missing account.companyName → required when business
        'shipment.hazardous': false,
      })

      expect(result.ok).toBe(false)
      expect(result.issues.rules.length).toBeGreaterThan(0)
      const companyIssue = result.issues.rules.find(
        (i) => i.field === 'account.companyName',
      )
      expect(companyIssue).toBeDefined()
    } finally {
      close()
    }
  })

  // ── Model patch ──

  it('model patch updates both tables', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      createSchema(sqlite)

      const policy = buildModelPolicy()

      // Create a quote with both account and shipment
      const createResult = policy.checkCreate({
        'account.accountType': 'business',
        'account.companyName': 'Old Co',
        'shipment.hazardous': false,
        'shipment.serviceLevel': 'standard',
      })

      const accountRow = db
        .insert(quoteAccounts)
        .values(createResult.dataByTable.account as QuoteAccount)
        .returning()
        .get()

      const shipmentRow = db
        .insert(quoteShipments)
        .values({
          ...(createResult.dataByTable.shipment as QuoteShipment),
          accountId: accountRow!.id,
        })
        .returning()
        .get()

      // Patch both tables at once
      const patchResult = policy.checkPatch(
        {
          'account.accountType': 'business',
          'account.companyName': 'Old Co',
          'shipment.hazardous': false,
          'shipment.serviceLevel': 'standard',
        },
        {
          'account.companyName': 'New Co',
          'shipment.serviceLevel': 'expedited',
        },
      )

      expect(patchResult.ok).toBe(true)
      expect(patchResult.dataByTable.account).toBeDefined()
      expect(patchResult.dataByTable.shipment).toBeDefined()

      // Execute both updates inside a transaction
      sqlite.run('BEGIN')
      db.update(quoteAccounts)
        .set(patchResult.dataByTable.account as Partial<QuoteAccount>)
        .where(sql`id = ${accountRow!.id}`)
        .run()
      db.update(quoteShipments)
        .set(patchResult.dataByTable.shipment as Partial<QuoteShipment>)
        .where(sql`id = ${shipmentRow!.id}`)
        .run()
      sqlite.run('COMMIT')

      // Verify both rows changed
      const updatedAccount = db
        .select()
        .from(quoteAccounts)
        .where(sql`id = ${accountRow!.id}`)
        .get() as Record<string, unknown> | undefined

      const updatedShipment = db
        .select()
        .from(quoteShipments)
        .where(sql`id = ${shipmentRow!.id}`)
        .get() as Record<string, unknown> | undefined

      expect(updatedAccount?.companyName).toBe('New Co')
      expect(updatedShipment?.serviceLevel).toBe('expedited')
    } finally {
      close()
    }
  })

  it('model patch clears stale namespaced dependent field', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      createSchema(sqlite)

      const policy = buildModelPolicy()
      const createResult = policy.checkCreate({
        'account.accountType': 'personal',
        'shipment.hazardous': true,
        'shipment.hazClass': 'class3_flammable',
        'shipment.serviceLevel': 'standard',
      })

      const accountRow = db
        .insert(quoteAccounts)
        .values(createResult.dataByTable.account as QuoteAccount)
        .returning()
        .get()

      const shipmentRow = db
        .insert(quoteShipments)
        .values({
          ...(createResult.dataByTable.shipment as QuoteShipment),
          accountId: accountRow!.id,
        })
        .returning()
        .get()

      const patchResult = policy.checkPatch(
        {
          'account.accountType': 'personal',
          'shipment.hazardous': true,
          'shipment.hazClass': 'class3_flammable',
          'shipment.serviceLevel': 'standard',
        },
        { 'shipment.hazardous': false },
      )

      expect(patchResult.ok).toBe(true)
      expect(patchResult.dataByTable.account).toEqual({})
      expect(patchResult.dataByTable.shipment).toEqual({
        hazClass: null,
        hazardous: false,
      })

      db.update(quoteShipments)
        .set(patchResult.dataByTable.shipment as Partial<QuoteShipment>)
        .where(sql`id = ${shipmentRow!.id}`)
        .run()

      const updatedShipment = db
        .select()
        .from(quoteShipments)
        .where(sql`id = ${shipmentRow!.id}`)
        .get() as Record<string, unknown> | undefined

      expect(updatedShipment?.hazardous).toBe(false)
      expect(updatedShipment?.hazClass).toBe(null)
    } finally {
      close()
    }
  })

  it('model patch blocks context-disabled field updates', () => {
    const { sqlite, close } = createMemoryDb()
    try {
      createSchema(sqlite)

      const policy = buildModelPolicy()
      const patchResult = policy.checkPatch(
        {
          'account.accountType': 'personal',
          'shipment.hazardous': false,
          'shipment.serviceLevel': 'standard',
        },
        { 'shipment.serviceLevel': 'expedited' },
        { context: { promoActive: true } },
      )

      expect(patchResult.ok).toBe(false)
      expect(
        patchResult.issues.rules.some(
          (i) => i.field === 'shipment.serviceLevel' && i.kind === 'disabled',
        ),
      ).toBe(true)
      expect(patchResult.dataByTable.shipment).not.toHaveProperty(
        'serviceLevel',
      )
    } finally {
      close()
    }
  })

  it('nested composed zod validation reports child errors as flat namespaced fields', () => {
    const { sqlite, close } = createMemoryDb()
    try {
      createSchema(sqlite)

      const policy = createDrizzleModelPolicy(
        {
          account: quoteAccounts,
          shipment: { table: quoteShipments, exclude: ['accountId'] },
        },
        {
          validation: createZodAdapter({
            schemas: modelSchemas,
            valueShape: 'nested',
            build() {
              return z.object({
                account: z.object({
                  accountType: z.enum(['personal', 'business']),
                  companyName: z.string().min(1, 'Company name is required'),
                }),
                shipment: z.object({
                  hazardous: z.boolean(),
                  serviceLevel: z.enum(['standard', 'expedited', 'overnight']),
                }),
              })
            },
          }),
        },
      )

      const result = policy.checkCreate({
        'account.accountType': 'business',
        'account.companyName': '',
        'shipment.hazardous': false,
        'shipment.serviceLevel': 'standard',
      })

      expect(result.ok).toBe(false)
      expect(result.issues.schema.length).toBeGreaterThan(0)
      expect(result.issues.schema).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'account.companyName',
            message: 'Company name is required',
          }),
        ]),
      )
    } finally {
      close()
    }
  })

  it('default flat zod validation still rejects nested schemas with coarse parent errors', () => {
    const { sqlite, close } = createMemoryDb()
    try {
      createSchema(sqlite)

      const policy = createDrizzleModelPolicy(
        {
          account: quoteAccounts,
          shipment: { table: quoteShipments, exclude: ['accountId'] },
        },
        {
          validation: createZodAdapter({
            schemas: modelSchemas,
            build() {
              return z.object({
                account: z.object({
                  accountType: z.enum(['personal', 'business']),
                  companyName: z.string().min(1, 'Company name is required'),
                }),
                shipment: z.object({
                  hazardous: z.boolean(),
                  serviceLevel: z.enum(['standard', 'expedited', 'overnight']),
                }),
              })
            },
          }),
        },
      )

      const result = policy.checkCreate({
        'account.accountType': 'business',
        'account.companyName': '',
        'shipment.hazardous': false,
        'shipment.serviceLevel': 'standard',
      })

      expect(result.ok).toBe(false)
      expect(result.issues.schema).toEqual([
        { field: 'account', message: 'Required' },
        { field: 'shipment', message: 'Required' },
      ])
    } finally {
      close()
    }
  })

  // ── WHERE semantics ──

  it('model result does not provide WHERE keys in payloads', () => {
    const { sqlite, close } = createMemoryDb()
    try {
      createSchema(sqlite)

      const policy = buildModelPolicy()

      // Create result — ids must NOT be in the payloads
      const result = policy.checkCreate(
        {
          'account.accountType': 'personal',
          'shipment.hazardous': false,
          'shipment.serviceLevel': 'standard',
        },
        { nonWritableKeys: 'strip' },
      )

      expect(result.ok).toBe(true)
      expect(result.dataByTable.account).not.toHaveProperty('id')
      expect(result.dataByTable.shipment).not.toHaveProperty('id')

      // Patch result — same id-free guarantee
      const patchResult = policy.checkPatch(
        {
          'account.accountType': 'personal',
          'account.companyName': null,
          'shipment.hazardous': false,
          'shipment.serviceLevel': 'standard',
        },
        { 'account.companyName': 'New Co' },
        { nonWritableKeys: 'strip' },
      )

      expect(patchResult.dataByTable.account).not.toHaveProperty('id')
      expect(patchResult.dataByTable.shipment).not.toHaveProperty('id')
    } finally {
      close()
    }
  })

  // ── Unknown namespace / non-writable keys ──

  it('unknown namespace rejects by default', () => {
    const { sqlite, close } = createMemoryDb()
    try {
      createSchema(sqlite)

      const policy = buildModelPolicy()
      const result = policy.checkCreate({
        'account.accountType': 'personal',
        'shipment.hazardous': false,
        'shipment.serviceLevel': 'standard',
        'billing.paymentMethod': 'invoice', // unknown namespace
      })

      expect(result.ok).toBe(false)
      expect(
        result.issues.columns.some(
          (c) => c.kind === 'unknown' && c.field === 'billing.paymentMethod',
        ),
      ).toBe(true)
    } finally {
      close()
    }
  })
})
