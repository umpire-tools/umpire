import { enabledWhen, umpire } from '@umpire/core'
import { Effect, SubscriptionRef } from 'effect'
import { fromSubscriptionRef } from '../src/from-subscription-ref.js'

const makeUmp = () =>
  umpire({
    fields: { name: {}, email: {} },
    rules: [
      enabledWhen(
        'email',
        (_values, conditions: { showEmail: boolean }) => conditions.showEmail,
      ),
    ],
  })

describe('fromSubscriptionRef', () => {
  test('reads initial availability from ref state', () => {
    const ump = makeUmp()
    const ref = Effect.runSync(SubscriptionRef.make({ showEmail: false }))

    const store = fromSubscriptionRef(ump, ref, {
      select: () => ({}),
      conditions: (state) => state,
    })

    expect(store.field('name').enabled).toBe(true)
    expect(store.field('email').enabled).toBe(false)
    store.destroy()
  })

  test('updates availability when ref changes', async () => {
    const ump = makeUmp()
    const ref = Effect.runSync(SubscriptionRef.make({ showEmail: false }))

    const store = fromSubscriptionRef(ump, ref, {
      select: () => ({}),
      conditions: (state) => state,
    })

    expect(store.field('email').enabled).toBe(false)

    const updated = new Promise<void>((resolve) => {
      const unsub = store.subscribe(() => {
        unsub()
        resolve()
      })
    })

    await Effect.runPromise(SubscriptionRef.set(ref, { showEmail: true }))
    await updated

    expect(store.field('email').enabled).toBe(true)
    store.destroy()
  })

  test('notifies subscribers with the new availability map', async () => {
    const ump = makeUmp()
    const ref = Effect.runSync(SubscriptionRef.make({ showEmail: false }))

    const store = fromSubscriptionRef(ump, ref, {
      select: () => ({}),
      conditions: (state) => state,
    })

    const received: boolean[] = []

    const updated = new Promise<void>((resolve) => {
      const unsub = store.subscribe((availability) => {
        received.push(availability.email.enabled)
        unsub()
        resolve()
      })
    })

    await Effect.runPromise(SubscriptionRef.set(ref, { showEmail: true }))
    await updated

    expect(received).toEqual([true])
    store.destroy()
  })

  test('destroy stops further notifications', async () => {
    const ump = makeUmp()
    const ref = Effect.runSync(SubscriptionRef.make({ showEmail: false }))

    const store = fromSubscriptionRef(ump, ref, {
      select: () => ({}),
      conditions: (state) => state,
    })

    let callCount = 0
    store.subscribe(() => {
      callCount++
    })

    store.destroy()

    await Effect.runPromise(SubscriptionRef.set(ref, { showEmail: true }))
    // Allow any pending microtasks to flush
    await new Promise<void>((resolve) => setTimeout(resolve, 10))

    expect(callCount).toBe(0)
  })

  test('tracks fouls across transitions', async () => {
    const ump = umpire({
      fields: { query: {}, filter: {} },
      rules: [enabledWhen('filter', (values) => Boolean(values.query))],
    })

    const ref = Effect.runSync(
      SubscriptionRef.make({ query: 'hello', filter: 'active' }),
    )

    const store = fromSubscriptionRef(ump, ref, {
      select: (state) => state,
    })

    expect(store.fouls).toHaveLength(0)

    const updated = new Promise<void>((resolve) => {
      const unsub = store.subscribe(() => {
        unsub()
        resolve()
      })
    })

    // Clearing query disables filter — filter still holds a stale value → foul
    await Effect.runPromise(
      SubscriptionRef.set(ref, { query: '', filter: 'active' }),
    )
    await updated

    expect(store.fouls).toHaveLength(1)
    expect(store.fouls[0]!.field).toBe('filter')
    store.destroy()
  })
})
