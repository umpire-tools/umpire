import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { InferInsertModel } from 'drizzle-orm'
import type { FieldDef, Rule } from '@umpire/core'
import { createDrizzlePolicy } from '@umpire/drizzle'
import {
  createJsonRules,
  fromJson,
  toJson,
  type JsonConditionDef,
} from '@umpire/json'

function createMemoryDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle({ client: sqlite })
  return { db, sqlite, close: () => sqlite.close() }
}

const calendarEvents = sqliteTable('calendar_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  eventType: text('event_type').notNull().default('meeting'),
  location: text('location'),
  videoUrl: text('video_url'),
  allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
  startTime: text('start_time'),
  endTime: text('end_time'),
  reminderEnabled: integer('reminder_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  reminderMinutes: integer('reminder_minutes'),
  visibility: text('visibility').notNull().default('public'),
  internalNotes: text('internal_notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
})

type CalendarEvent = InferInsertModel<typeof calendarEvents>
type CalendarContext = { canEditInternal: boolean }

function createSchema() {
  return `
    CREATE TABLE calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'meeting',
      location TEXT,
      video_url TEXT,
      all_day INTEGER NOT NULL DEFAULT 0,
      start_time TEXT,
      end_time TEXT,
      reminder_enabled INTEGER NOT NULL DEFAULT 0,
      reminder_minutes INTEGER,
      visibility TEXT NOT NULL DEFAULT 'public',
      internal_notes TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `
}

const requiredCalendarFields = {
  location: { required: true },
  videoUrl: { required: true },
  reminderMinutes: { required: true },
} satisfies Record<string, FieldDef>

const calendarConditions = {
  canEditInternal: { type: 'boolean' },
} satisfies Record<string, JsonConditionDef>

function createPortableCalendarRules() {
  const { enabledWhenExpr, expr, requiresExpr } = createJsonRules<
    Record<string, FieldDef>,
    CalendarContext
  >()

  return [
    requiresExpr('location', expr.eq('eventType', 'in_person')),
    requiresExpr('videoUrl', expr.eq('eventType', 'virtual')),
    requiresExpr('reminderMinutes', expr.eq('reminderEnabled', true)),
    enabledWhenExpr('internalNotes', expr.cond('canEditInternal')),
  ]
}

function createCalendarPolicy(
  rules: Rule<Record<string, FieldDef>, CalendarContext>[],
  fields: Partial<Record<string, FieldDef>> = requiredCalendarFields,
) {
  return createDrizzlePolicy(calendarEvents, {
    table: { exclude: ['createdAt'] },
    fields,
    rules,
  })
}

describe('drizzle sqlite with portable json rules', () => {
  it('uses JSON DSL rules in a Drizzle create policy', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const policy = createCalendarPolicy(createPortableCalendarRules())

      const missingVideoUrl = policy.checkCreate(
        {
          title: 'Planning',
          eventType: 'virtual',
          reminderEnabled: false,
        },
        { context: { canEditInternal: false } },
      )

      expect(missingVideoUrl.ok).toBe(false)
      expect(
        missingVideoUrl.issues.rules.some(
          (issue) => issue.field === 'videoUrl' && issue.kind === 'required',
        ),
      ).toBe(true)

      const result = policy.checkCreate(
        {
          title: 'Planning',
          eventType: 'virtual',
          videoUrl: 'https://meet.example/planning',
          reminderEnabled: true,
          reminderMinutes: 15,
          internalNotes: 'Host joins early',
        },
        { context: { canEditInternal: true } },
      )

      expect(result.ok).toBe(true)

      const inserted = db
        .insert(calendarEvents)
        .values(result.data as CalendarEvent)
        .returning()
        .get()

      expect(inserted!.id).toBeGreaterThan(0)
      expect(inserted!.eventType).toBe('virtual')
      expect(inserted!.videoUrl).toBe('https://meet.example/planning')
      expect(inserted!.reminderEnabled).toBe(true)
      expect(inserted!.reminderMinutes).toBe(15)
      expect(inserted!.internalNotes).toBe('Host joins early')
      expect(inserted!.createdAt).toBeInstanceOf(Date)
    } finally {
      close()
    }
  })

  it('round-trips JSON DSL rules and reuses hydrated rules in a Drizzle patch policy', () => {
    const { db, sqlite, close } = createMemoryDb()
    try {
      sqlite.run(createSchema())

      const sourcePolicy = createCalendarPolicy(createPortableCalendarRules())
      const schema = toJson({
        fields: sourcePolicy.fields,
        rules: sourcePolicy.rules,
        conditions: calendarConditions,
      })
      const hydrated = fromJson<CalendarContext>(schema)
      const hydratedPolicy = createCalendarPolicy(
        hydrated.rules,
        hydrated.fields,
      )

      expect(schema.rules).toEqual([
        {
          type: 'requires',
          field: 'location',
          when: { op: 'eq', field: 'eventType', value: 'in_person' },
        },
        {
          type: 'requires',
          field: 'videoUrl',
          when: { op: 'eq', field: 'eventType', value: 'virtual' },
        },
        {
          type: 'requires',
          field: 'reminderMinutes',
          when: { op: 'eq', field: 'reminderEnabled', value: true },
        },
        {
          type: 'enabledWhen',
          field: 'internalNotes',
          when: { op: 'cond', condition: 'canEditInternal' },
        },
      ])

      const createResult = hydratedPolicy.checkCreate(
        {
          title: 'Design review',
          eventType: 'in_person',
          location: 'Room 4B',
          reminderEnabled: true,
          reminderMinutes: 30,
        },
        { context: { canEditInternal: false } },
      )

      const inserted = db
        .insert(calendarEvents)
        .values(createResult.data as CalendarEvent)
        .returning()
        .get()

      const patchResult = hydratedPolicy.checkPatch(
        {
          title: 'Design review',
          eventType: 'in_person',
          location: 'Room 4B',
          reminderEnabled: true,
          reminderMinutes: 30,
        },
        {
          eventType: 'virtual',
          videoUrl: 'https://meet.example/design-review',
          reminderEnabled: false,
        },
        { context: { canEditInternal: false } },
      )

      expect(patchResult.ok).toBe(true)
      expect(patchResult.data).toEqual({
        location: null,
        reminderMinutes: null,
        eventType: 'virtual',
        videoUrl: 'https://meet.example/design-review',
        reminderEnabled: false,
      })

      db.update(calendarEvents)
        .set(patchResult.data as Partial<CalendarEvent>)
        .where(sql`id = ${inserted!.id}`)
        .run()

      const updated = db
        .select()
        .from(calendarEvents)
        .where(sql`id = ${inserted!.id}`)
        .get() as Record<string, unknown> | undefined

      expect(updated?.eventType).toBe('virtual')
      expect(updated?.location).toBe(null)
      expect(updated?.videoUrl).toBe('https://meet.example/design-review')
      expect(updated?.reminderEnabled).toBe(false)
      expect(updated?.reminderMinutes).toBe(null)

      const internalNotesPatch = hydratedPolicy.checkPatch(
        {
          title: 'Design review',
          eventType: 'virtual',
          videoUrl: 'https://meet.example/design-review',
          reminderEnabled: false,
        },
        { internalNotes: 'Private room link' },
        { context: { canEditInternal: false } },
      )

      expect(internalNotesPatch.ok).toBe(false)
      expect(
        internalNotesPatch.issues.rules.some(
          (issue) =>
            issue.field === 'internalNotes' && issue.kind === 'disabled',
        ),
      ).toBe(true)
    } finally {
      close()
    }
  })
})
