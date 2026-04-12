import { snapshotRecord } from '../src/snapshot.js'

describe('snapshotRecord', () => {
  it('clones nested arrays and objects', () => {
    const original = {
      settings: {
        weekdays: ['Mon', 'Wed'],
      },
    }

    const snapshot = snapshotRecord(original)

    original.settings.weekdays.push('Fri')

    expect(snapshot).toEqual({
      settings: {
        weekdays: ['Mon', 'Wed'],
      },
    })
  })

  it('clones maps, sets, and dates', () => {
    const original = {
      seen: new Set(['a', 'b']),
      lookup: new Map([['mode', 'weekly']]),
      start: new Date('2025-01-01T00:00:00.000Z'),
    }

    const snapshot = snapshotRecord(original)

    original.seen.add('c')
    original.lookup.set('mode', 'monthly')
    original.start.setUTCDate(2)

    expect(Array.from(snapshot.seen)).toEqual(['a', 'b'])
    expect(Array.from(snapshot.lookup.entries())).toEqual([['mode', 'weekly']])
    expect(snapshot.start.toISOString()).toBe('2025-01-01T00:00:00.000Z')
  })
})
