import { snapshotValue } from '../src/snapshot.js'

class CustomValue {
  constructor(readonly value: string) {}
}

describe('snapshotValue', () => {
  test('deep-clones plain objects and arrays', () => {
    const original = {
      nested: {
        tags: ['alpha', 'beta'],
      },
    }

    const snapshot = snapshotValue(original)
    snapshot.nested.tags.push('gamma')

    expect(original.nested.tags).toEqual(['alpha', 'beta'])
    expect(snapshot).toEqual({
      nested: {
        tags: ['alpha', 'beta', 'gamma'],
      },
    })
  })

  test('clones dates, maps, and sets', () => {
    const date = new Date('2026-01-01T00:00:00.000Z')
    const original = {
      date,
      map: new Map<string, { count: number }>([['items', { count: 1 }]]),
      set: new Set([{ label: 'one' }]),
    }

    const snapshot = snapshotValue(original)
    const mapped = snapshot.map.get('items')
    const setEntry = Array.from(snapshot.set)[0] as { label: string }

    mapped!.count = 2
    setEntry.label = 'updated'

    expect(snapshot.date).not.toBe(date)
    expect(snapshot.date.toISOString()).toBe(date.toISOString())
    expect(original.map.get('items')).toEqual({ count: 1 })
    expect(Array.from(original.set)[0]).toEqual({ label: 'one' })
  })

  test('preserves custom instances by reference', () => {
    const custom = new CustomValue('keep-prototype')
    const snapshot = snapshotValue({ custom })

    expect(snapshot.custom).toBe(custom)
  })

  test('supports cyclic plain-object graphs', () => {
    const original = { label: 'root' } as { label: string; self?: unknown }
    original.self = original

    const snapshot = snapshotValue(original)

    expect(snapshot).not.toBe(original)
    expect(snapshot.self).toBe(snapshot)
  })
})
