import { renderHook } from '@testing-library/react'
import { umpire, enabledWhen, oneOf } from '@umpire/core'
import type { FieldDef } from '@umpire/core'
import { useUmpire } from '../src/useUmpire.js'

const fields = {
  name: { default: '' },
  email: { default: '' },
  phone: { default: '' },
} satisfies Record<string, FieldDef>

describe('useUmpire', () => {
  it('recomputes check when values change', () => {
    const ump = umpire({
      fields,
      rules: [enabledWhen('phone', (values) => !!values.name)],
    })

    const { result, rerender } = renderHook(
      ({ values }) => useUmpire(ump, values),
      { initialProps: { values: { name: '', email: '', phone: '' } } },
    )

    expect(result.current.check.phone.enabled).toBe(false)
    expect(result.current.check.name.enabled).toBe(true)
    expect(result.current.check.email.enabled).toBe(true)

    rerender({ values: { name: 'Alice', email: '', phone: '' } })

    expect(result.current.check.phone.enabled).toBe(true)
  })

  it('tracks prev correctly across rerenders', () => {
    const ump = umpire({
      fields,
      rules: [enabledWhen('phone', (values) => !!values.name)],
    })

    const { result, rerender } = renderHook(
      ({ values }) => useUmpire(ump, values),
      {
        initialProps: {
          values: { name: 'Alice', email: '', phone: '555-1234' },
        },
      },
    )

    // Second render: still enabled, no foul
    rerender({ values: { name: 'Bob', email: '', phone: '555-1234' } })
    expect(result.current.fouls).toEqual([])

    // Third render: disable phone
    rerender({ values: { name: '', email: '', phone: '555-1234' } })
    expect(result.current.fouls.length).toBe(1)

    // Fourth render: re-enable phone — no foul (was disabled -> enabled)
    rerender({ values: { name: 'Carol', email: '', phone: '555-1234' } })
    expect(result.current.fouls).toEqual([])
  })

  it('snapshots previous nested objects between renders', () => {
    const nestedFields = {
      settings: {},
      note: { default: '' },
    } satisfies Record<string, FieldDef>
    const sharedSettings = { allowNote: true }
    const ump = umpire({
      fields: nestedFields,
      rules: [
        enabledWhen('note', (values) => {
          return (
            (values.settings as { allowNote: boolean } | undefined)
              ?.allowNote === true
          )
        }),
      ],
    })

    const { result, rerender } = renderHook(
      ({ values }) => useUmpire(ump, values),
      {
        initialProps: { values: { settings: sharedSettings, note: 'keep me' } },
      },
    )

    sharedSettings.allowNote = false
    rerender({ values: { settings: sharedSettings, note: 'keep me' } })

    expect(result.current.check.note.enabled).toBe(false)
    expect(result.current.fouls.some((foul) => foul.field === 'note')).toBe(
      true,
    )
  })

  it('passes conditions to check', () => {
    type Ctx = { premium: boolean }

    const ctxFields = {
      advanced: { default: '' },
      basic: { default: '' },
    } satisfies Record<string, FieldDef>

    const ump = umpire<typeof ctxFields, Ctx>({
      fields: ctxFields,
      rules: [enabledWhen('advanced', (_values, ctx) => ctx.premium)],
    })

    const { result, rerender } = renderHook(
      ({ conditions }) =>
        useUmpire(ump, { advanced: '', basic: '' }, conditions),
      { initialProps: { conditions: { premium: false } as Ctx } },
    )

    expect(result.current.check.advanced.enabled).toBe(false)

    rerender({ conditions: { premium: true } })

    expect(result.current.check.advanced.enabled).toBe(true)
  })

  it('passes prev to check for oneOf resolution', () => {
    const isEmpty = (v: unknown) => v === '' || v === undefined || v === null
    const oneOfFields = {
      date: { default: '', isEmpty },
      time: { default: '', isEmpty },
      weekday: { default: '', isEmpty },
    } satisfies Record<string, FieldDef>

    const ump = umpire({
      fields: oneOfFields,
      rules: [
        oneOf('schedule', {
          specific: ['date', 'time'],
          recurring: ['weekday'],
        }),
      ],
    })

    const { result, rerender } = renderHook(
      ({ values }) => useUmpire(ump, values),
      { initialProps: { values: { date: '', time: '', weekday: '' } } },
    )

    // No branch satisfied — activeBranch is null, all fields enabled
    expect(result.current.check.date.enabled).toBe(true)
    expect(result.current.check.time.enabled).toBe(true)
    expect(result.current.check.weekday.enabled).toBe(true)

    // Fill date — only "specific" branch satisfied now
    rerender({ values: { date: '2025-01-01', time: '', weekday: '' } })

    // "specific" branch active — weekday disabled
    expect(result.current.check.date.enabled).toBe(true)
    expect(result.current.check.time.enabled).toBe(true)
    expect(result.current.check.weekday.enabled).toBe(false)

    // Switch to weekday — prev tracking passes previous values for branch detection
    rerender({ values: { date: '', time: '', weekday: 'Monday' } })

    // "recurring" branch now active via prev detection — specific fields disabled
    expect(result.current.check.weekday.enabled).toBe(true)
    expect(result.current.check.date.enabled).toBe(false)
    expect(result.current.check.time.enabled).toBe(false)
  })
})
