import { describe, expect, it, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { InferInsertModel } from 'drizzle-orm'
import { enabledWhen, oneOf, requires } from '@umpire/core'
import { createZodAdapter } from '@umpire/zod'
import { createEffectAdapter } from '@umpire/effect'
import { Schema } from 'effect'
import { z } from 'zod'
import { createDrizzlePolicy } from '@umpire/drizzle'

// ── SQLite harness ──

function createMemoryDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle({ client: sqlite })
  return { db, sqlite, close: () => sqlite.close() }
}

// ── Freight quote table ──

const freightQuotes = sqliteTable('freight_quotes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountType: text('account_type').notNull().default('personal'),
  companyName: text('company_name'),
  hazardous: integer('hazardous', { mode: 'boolean' }).notNull().default(false),
  hazClass: text('haz_class'),
  handlingMode: text('handling_mode').notNull().default('standard'),
  blankets: integer('blankets'),
  crateType: text('crate_type'),
  tempRange: text('temp_range'),
  humidity: real('humidity'),
  serviceLevel: text('service_level').notNull().default('standard'),
  vehicleType: text('vehicle_type').notNull().default('dry_van'),
  discountOverride: real('discount_override'),
  priceHold: integer('price_hold', { mode: 'boolean' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
})

type FreightQuote = InferInsertModel<typeof freightQuotes>

function createSchema() {
  return `
    CREATE TABLE freight_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_type TEXT NOT NULL DEFAULT 'personal',
      company_name TEXT,
      hazardous INTEGER NOT NULL DEFAULT 0,
      haz_class TEXT,
      handling_mode TEXT NOT NULL DEFAULT 'standard',
      blankets INTEGER,
      crate_type TEXT,
      temp_range TEXT,
      humidity REAL,
      service_level TEXT NOT NULL DEFAULT 'standard',
      vehicle_type TEXT NOT NULL DEFAULT 'dry_van',
      discount_override REAL,
      price_hold INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `
}

// ── Zod schemas ──

const freightSchemas = {
  accountType: z.enum(['personal', 'business']),
  companyName: z.string().min(1, 'Company name is required'),
  hazardous: z.boolean(),
  hazClass: z.enum([
    'class1_explosives',
    'class2_gases',
    'class3_flammable',
    'class4_flammable_solid',
    'class5_oxidizer',
    'class6_toxic',
    'class7_radioactive',
    'class8_corrosive',
    'class9_misc',
  ]),
  handlingMode: z.enum(['standard', 'fragile', 'climate']),
  blankets: z.number().int().positive(),
  crateType: z.enum(['wood', 'plastic', 'metal']),
  tempRange: z.enum(['frozen', 'refrigerated', 'ambient']),
  humidity: z.number().min(0).max(100),
  serviceLevel: z.enum(['standard', 'expedited', 'overnight']),
  vehicleType: z.enum(['dry_van', 'reefer', 'flatbed', 'liftgate']),
  discountOverride: z.number().min(0).max(100),
  priceHold: z.boolean(),
}

// ── Policy builder ──

function buildPolicy() {
  return createDrizzlePolicy(freightQuotes, {
    table: { exclude: ['createdAt'] },
    fields: { companyName: { required: true } },
    rules: [
      requires('companyName', (v) => v.accountType === 'business'),
      requires('hazClass', (v) => v.hazardous === true),
      oneOf(
        'handlingMode',
        {
          fragile: ['blankets', 'crateType'],
          climate: ['tempRange', 'humidity'],
        },
        {
          activeBranch: (v) =>
            v.handlingMode === 'standard'
              ? null
              : (v.handlingMode as 'fragile' | 'climate'),
        },
      ),
      enabledWhen('discountOverride', (_v, c) => Boolean(c.isAdmin)),
      enabledWhen('priceHold', (_v, c) => Boolean(c.isAdmin)),
      enabledWhen('serviceLevel', (_v, c) => !Boolean(c.promoActive)),
      enabledWhen('vehicleType', (_v, c) => !Boolean(c.promoActive)),
    ],
    validation: createZodAdapter({ schemas: freightSchemas, rejectFoul: true }),
  })
}

// ── Tests ──

describe('drizzle sqlite freight quote single-table write', () => {
  afterEach(() => {
    // Each test manages its own db lifecycle
  })

  // ── Stage 2: Create / update flows ──

  it('business create writes successfully with real db insert', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const policy = buildPolicy()
      const result = policy.checkCreate({
        accountType: 'business',
        companyName: 'Acme Logistics',
        hazardous: true,
        hazClass: 'class3_flammable',
        handlingMode: 'fragile',
        blankets: 3,
        crateType: 'wood',
        serviceLevel: 'standard',
        vehicleType: 'dry_van',
      })

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()

      const inserted = db
        .insert(freightQuotes)
        .values(result.data as FreightQuote)
        .returning()
        .get()

      expect(inserted).not.toBeNull()
      expect(inserted!.id).toBeGreaterThan(0)
      expect(inserted!.accountType).toBe('business')
      expect(inserted!.companyName).toBe('Acme Logistics')
      expect(inserted!.hazardous).toBe(true)
      expect(inserted!.hazClass).toBe('class3_flammable')
      expect(inserted!.handlingMode).toBe('fragile')
      expect(inserted!.blankets).toBe(3)
      expect(inserted!.crateType).toBe('wood')
      expect(inserted!.serviceLevel).toBe('standard')
      expect(inserted!.vehicleType).toBe('dry_van')
      // Static defaults should be present via candidate
      expect(inserted!.discountOverride).toBeNull()
      expect(inserted!.priceHold).toBeNull()
      // Runtime db default: created_at exists but not from payload
      expect(inserted!.createdAt).toBeInstanceOf(Date)
    } finally {
      close()
    }
  })

  it('missing conditional company name blocks insert', () => {
    const { sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const policy = buildPolicy()
      const result = policy.checkCreate({
        accountType: 'business',
        hazardous: false,
        serviceLevel: 'standard',
        vehicleType: 'dry_van',
      })

      expect(result.ok).toBe(false)
      expect(result.issues.rules.length).toBeGreaterThan(0)
      const companyIssue = result.issues.rules.find(
        (i) => i.field === 'companyName',
      )
      expect(companyIssue).toBeDefined()
      // Do not call insert when !ok
    } finally {
      close()
    }
  })

  it('non-writable keys reject by default and strip when requested', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const policy = buildPolicy()
      const withNonWritable = policy.checkCreate({
        id: 999,
        accountType: 'personal',
        hazardous: false,
        serviceLevel: 'standard',
        vehicleType: 'dry_van',
        createdAt: new Date(),
      })

      // Default: reject non-writable keys
      expect(withNonWritable.ok).toBe(false)
      expect(withNonWritable.issues.columns.length).toBeGreaterThan(0)
      const nonWritableIssues = withNonWritable.issues.columns.filter(
        (c) => c.kind === 'nonWritable',
      )
      expect(nonWritableIssues.some((c) => c.field === 'id')).toBe(true)

      // Strip mode: non-writable keys are removed, write succeeds
      const stripped = policy.checkCreate(
        {
          id: 999,
          accountType: 'personal',
          hazardous: false,
          serviceLevel: 'standard',
          vehicleType: 'dry_van',
          createdAt: new Date(),
        },
        { nonWritableKeys: 'strip' },
      )

      expect(stripped.ok).toBe(true)
      expect(stripped.data).not.toHaveProperty('id')
      expect(stripped.data).not.toHaveProperty('createdAt')

      const inserted = db
        .insert(freightQuotes)
        .values(stripped.data as FreightQuote)
        .returning()
        .get()

      expect(inserted!.id).toBeGreaterThan(0)
    } finally {
      close()
    }
  })

  it('unknown keys reject by default and strip when requested', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const policy = buildPolicy()
      const withUnknown = policy.checkCreate({
        accountType: 'personal',
        hazardous: false,
        serviceLevel: 'standard',
        vehicleType: 'dry_van',
        clientOnlyNote: 'fragile',
      })

      // Default: reject unknown keys
      expect(withUnknown.ok).toBe(false)
      expect(withUnknown.issues.columns.some((c) => c.kind === 'unknown')).toBe(
        true,
      )

      // Strip mode: unknown keys removed, write succeeds
      const stripped = policy.checkCreate(
        {
          accountType: 'personal',
          hazardous: false,
          serviceLevel: 'standard',
          vehicleType: 'dry_van',
          clientOnlyNote: 'fragile',
        },
        { unknownKeys: 'strip' },
      )

      expect(stripped.ok).toBe(true)
      expect(stripped.data).not.toHaveProperty('clientOnlyNote')

      const inserted = db
        .insert(freightQuotes)
        .values(stripped.data as FreightQuote)
        .returning()
        .get()

      expect(inserted!.accountType).toBe('personal')
    } finally {
      close()
    }
  })

  it('promo patch disables writable fields and prevents stale write', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const policy = buildPolicy()
      const createResult = policy.checkCreate({
        accountType: 'personal',
        hazardous: false,
        serviceLevel: 'standard',
        vehicleType: 'dry_van',
      })

      const inserted = db
        .insert(freightQuotes)
        .values(createResult.data as FreightQuote)
        .returning()
        .get()

      // Patch with promo active — serviceLevel should be disabled
      const patchResult = policy.checkPatch(
        {
          accountType: 'personal',
          hazardous: true, // existing value
          serviceLevel: 'standard',
          vehicleType: 'dry_van',
        },
        { serviceLevel: 'expedited' },
        { context: { promoActive: true } },
      )

      expect(patchResult.ok).toBe(false)
      expect(
        patchResult.issues.rules.some(
          (i) => i.field === 'serviceLevel' && i.kind === 'disabled',
        ),
      ).toBe(true)

      // Verify no db update was attempted (by checking row is unchanged)
      const row = db
        .select()
        .from(freightQuotes)
        .where(sql`id = ${inserted!.id}`)
        .get() as Record<string, unknown> | undefined
      expect(row?.serviceLevel).toBe('standard')
    } finally {
      close()
    }
  })

  it('patch writes only patch-shaped data', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const policy = buildPolicy()
      const createResult = policy.checkCreate({
        accountType: 'business',
        companyName: 'Old Co',
        hazardous: false,
        serviceLevel: 'standard',
        vehicleType: 'dry_van',
      })

      const inserted = db
        .insert(freightQuotes)
        .values(createResult.data as FreightQuote)
        .returning()
        .get()

      // Patch only companyName
      const patchResult = policy.checkPatch(
        {
          accountType: 'business',
          companyName: 'Old Co',
          hazardous: false,
          serviceLevel: 'standard',
          vehicleType: 'dry_van',
        },
        { companyName: 'New Co' },
      )

      expect(patchResult.ok).toBe(true)
      expect(Object.keys(patchResult.data as Record<string, unknown>)).toEqual([
        'companyName',
      ])

      db.update(freightQuotes)
        .set(patchResult.data as Partial<FreightQuote>)
        .where(sql`id = ${inserted!.id}`)
        .run()

      const updated = db
        .select()
        .from(freightQuotes)
        .where(sql`id = ${inserted!.id}`)
        .get() as Record<string, unknown> | undefined

      expect(updated?.companyName).toBe('New Co')
      expect(updated?.accountType).toBe('business')
      expect(updated?.hazardous).toBe(false)
      expect(updated?.serviceLevel).toBe('standard')
    } finally {
      close()
    }
  })

  it('patch clears stale dependent field when discriminator changes', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const policy = buildPolicy()
      const createResult = policy.checkCreate({
        accountType: 'business',
        companyName: 'Old Co',
        hazardous: false,
        serviceLevel: 'standard',
        vehicleType: 'dry_van',
      })

      const inserted = db
        .insert(freightQuotes)
        .values(createResult.data as FreightQuote)
        .returning()
        .get()

      const patchResult = policy.checkPatch(
        {
          accountType: 'business',
          companyName: 'Old Co',
          hazardous: false,
          serviceLevel: 'standard',
          vehicleType: 'dry_van',
        },
        { accountType: 'personal' },
      )

      expect(patchResult.ok).toBe(true)
      expect(patchResult.data).toHaveProperty('accountType', 'personal')
      expect(patchResult.data).toHaveProperty('companyName', null)

      db.update(freightQuotes)
        .set(patchResult.data as Partial<FreightQuote>)
        .where(sql`id = ${inserted!.id}`)
        .run()

      const updated = db
        .select()
        .from(freightQuotes)
        .where(sql`id = ${inserted!.id}`)
        .get() as Record<string, unknown> | undefined

      expect(updated?.accountType).toBe('personal')
      expect(updated?.companyName).toBe(null)
    } finally {
      close()
    }
  })

  it('patch clears stale boolean-dependent detail when toggle turns off', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const policy = buildPolicy()
      const createResult = policy.checkCreate({
        accountType: 'personal',
        hazardous: true,
        hazClass: 'class3_flammable',
        serviceLevel: 'standard',
        vehicleType: 'dry_van',
      })

      const inserted = db
        .insert(freightQuotes)
        .values(createResult.data as FreightQuote)
        .returning()
        .get()

      const patchResult = policy.checkPatch(
        {
          accountType: 'personal',
          hazardous: true,
          hazClass: 'class3_flammable',
          serviceLevel: 'standard',
          vehicleType: 'dry_van',
        },
        { hazardous: false },
      )

      expect(patchResult.ok).toBe(true)
      expect(patchResult.data).toHaveProperty('hazardous', false)
      expect(patchResult.data).toHaveProperty('hazClass', null)

      db.update(freightQuotes)
        .set(patchResult.data as Partial<FreightQuote>)
        .where(sql`id = ${inserted!.id}`)
        .run()

      const updated = db
        .select()
        .from(freightQuotes)
        .where(sql`id = ${inserted!.id}`)
        .get() as Record<string, unknown> | undefined

      expect(updated?.hazardous).toBe(false)
      expect(updated?.hazClass).toBe(null)
    } finally {
      close()
    }
  })

  it('empty patch succeeds with no write payload', () => {
    const { sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const policy = buildPolicy()
      const patchResult = policy.checkPatch(
        {
          accountType: 'personal',
          companyName: null,
          hazardous: false,
          handlingMode: 'standard',
          serviceLevel: 'standard',
          vehicleType: 'dry_van',
        },
        {},
      )

      expect(patchResult.ok).toBe(true)
      expect(patchResult.data).toEqual({})
    } finally {
      close()
    }
  })

  it('validation failure and rule failure coexist', () => {
    const { sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const policy = buildPolicy()
      const result = policy.checkCreate({
        accountType: 'business',
        // missing companyName → rule issue
        hazardous: false,
        humidity: 200, // out of range → schema issue
        serviceLevel: 'standard',
        vehicleType: 'dry_van',
      })

      expect(result.ok).toBe(false)
      expect(result.issues.rules.length).toBeGreaterThan(0)
      expect(result.issues.schema.length).toBeGreaterThan(0)
    } finally {
      close()
    }
  })

  // ── Stage 3: oneOf patch stress ──

  it('transition fouls detect stale fragile values on handling mode switch', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const policy = buildPolicy()
      const createResult = policy.checkCreate({
        accountType: 'personal',
        hazardous: false,
        handlingMode: 'fragile',
        blankets: 3,
        crateType: 'wood',
        serviceLevel: 'standard',
        vehicleType: 'dry_van',
      })

      const inserted = db
        .insert(freightQuotes)
        .values(createResult.data as FreightQuote)
        .returning()
        .get()

      // Patch switching to climate but leaving fragile fields stale
      const badPatch = policy.checkPatch(
        {
          accountType: 'personal',
          hazardous: false,
          handlingMode: 'fragile',
          blankets: 3,
          crateType: 'wood',
          serviceLevel: 'standard',
          vehicleType: 'dry_van',
        },
        { handlingMode: 'climate' },
      )

      // Preflight should auto-clear stale fragile fields via generated nulls.
      // checkDrizzlePatch now includes null clears for disabled fields in data.
      expect(badPatch.ok).toBe(true)
      const patchData = badPatch.data as Record<string, unknown>
      expect(patchData).toHaveProperty('handlingMode', 'climate')
      expect(patchData).toHaveProperty('blankets', null)
      expect(patchData).toHaveProperty('crateType', null)

      // Explicit null clears produce the same result as auto-generated clears
      const explicitPatch = policy.checkPatch(
        {
          accountType: 'personal',
          hazardous: false,
          handlingMode: 'fragile',
          blankets: 3,
          crateType: 'wood',
          serviceLevel: 'standard',
          vehicleType: 'dry_van',
        },
        {
          handlingMode: 'climate',
          blankets: null,
          crateType: null,
          tempRange: 'frozen',
          humidity: 50,
        },
      )

      expect(explicitPatch.ok).toBe(true)
      const explicitPatchData = explicitPatch.data as Record<string, unknown>
      expect(explicitPatchData).toHaveProperty('handlingMode', 'climate')
      expect(explicitPatchData).toHaveProperty('tempRange', 'frozen')
      expect(explicitPatchData).toHaveProperty('humidity', 50)
      expect(explicitPatchData).toHaveProperty('blankets', null)
      expect(explicitPatchData).toHaveProperty('crateType', null)

      db.update(freightQuotes)
        .set(explicitPatch.data as Partial<FreightQuote>)
        .where(sql`id = ${inserted!.id}`)
        .run()

      const updated = db
        .select()
        .from(freightQuotes)
        .where(sql`id = ${inserted!.id}`)
        .get() as Record<string, unknown> | undefined

      expect(updated?.handlingMode).toBe('climate')
      expect(updated?.tempRange).toBe('frozen')
      expect(updated?.humidity).toBe(50)
      expect(updated?.blankets).toBe(null)
      expect(updated?.crateType).toBe(null)
    } finally {
      close()
    }
  })

  // ── Stage 5: Effect validation ──

  it('effect adapter validates humidity range and handling mode enum', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const effectSchemas = {
        handlingMode: Schema.Literals(['standard', 'fragile', 'climate']),
        humidity: Schema.Number.check(
          Schema.makeFilter((n) =>
            n >= 0 && n <= 100 ? undefined : 'Must be between 0 and 100',
          ),
        ),
      }

      const policy = createDrizzlePolicy(freightQuotes, {
        table: { exclude: ['createdAt'] },
        validation: createEffectAdapter({
          schemas: effectSchemas,
          rejectFoul: true,
        }),
      })

      // Invalid: humidity out of range
      const badResult = policy.checkCreate({
        accountType: 'personal',
        hazardous: false,
        handlingMode: 'invalid',
        humidity: 200,
        serviceLevel: 'standard',
        vehicleType: 'dry_van',
      })

      expect(badResult.ok).toBe(false)
      expect(badResult.issues.schema.length).toBeGreaterThan(0)

      // Valid: humidity in range, valid handling mode
      const goodResult = policy.checkCreate({
        accountType: 'personal',
        hazardous: false,
        handlingMode: 'fragile',
        blankets: 2,
        crateType: 'plastic',
        humidity: 50,
        serviceLevel: 'standard',
        vehicleType: 'dry_van',
      })

      expect(goodResult.ok).toBe(true)

      const inserted = db
        .insert(freightQuotes)
        .values(goodResult.data as FreightQuote)
        .returning()
        .get()

      expect(inserted!.humidity).toBe(50)
      expect(inserted!.handlingMode).toBe('fragile')
    } finally {
      close()
    }
  })
})
