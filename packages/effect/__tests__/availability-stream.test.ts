import { defineRule, enabledWhen, umpire } from '@umpire/core'
import { Deferred, Effect, Fiber, Stream, SubscriptionRef } from 'effect'
import { availabilityStream } from '../src/availability-stream.js'

function makeRef<S>(initial: S): SubscriptionRef.SubscriptionRef<S> {
  return Effect.runSync(SubscriptionRef.make(initial))
}

describe('availabilityStream', () => {
  test('emits the current availability on first emission', async () => {
    const ump = umpire({
      fields: { name: { required: true } },
      rules: [],
    })
    const ref = makeRef({ name: 'Alice' })
    const stream = availabilityStream(ump, ref, {
      select: (s) => ({ name: s.name }),
    })

    const items = await Effect.runPromise(
      Stream.take(stream, 1).pipe(Stream.runCollect),
    )
    const [first] = items

    expect(first).toBeDefined()
    expect(first?.name).toMatchObject({
      enabled: true,
      satisfied: true,
    })
  })

  test('emits updated availability after ref changes', async () => {
    const ump = umpire({
      fields: { name: { required: true } },
      rules: [],
    })
    const ref = makeRef({ name: 'Alice' })
    const stream = availabilityStream(ump, ref, {
      select: (s) => ({ name: s.name }),
    })

    const ready = Effect.runSync(Deferred.make<void>())
    const fiber = Effect.runFork(
      Stream.take(stream, 2).pipe(
        Stream.tap(() => Deferred.succeed(ready, undefined)),
        Stream.runCollect,
      ),
    )

    await Effect.runPromise(Deferred.await(ready))
    await Effect.runPromise(
      SubscriptionRef.set(ref, { name: undefined as unknown as string }),
    )

    const items = await Effect.runPromise(Fiber.join(fiber))

    expect(items.length).toBe(2)
    const updated = items[1]
    expect(updated.name.satisfied).toBe(false)
  })

  test('passes previous values to ump.check on subsequent emissions', async () => {
    const ump = umpire({
      fields: { email: { required: true }, name: {} },
      rules: [
        defineRule({
          type: 'previous-email',
          targets: ['name'],
          sources: ['email'],
          evaluate: (values, _conditions, prev) =>
            new Map([
              [
                'name',
                {
                  enabled: values.email === '' && prev?.email === 'a@b.com',
                  reason: null,
                },
              ],
            ]),
        }),
      ],
    })
    const ref = makeRef({ email: 'a@b.com', name: 'Bob' })
    const stream = availabilityStream(ump, ref, {
      select: (s) => ({ email: s.email, name: s.name }),
    })

    // Collect first emission
    const [initial] = await Effect.runPromise(
      Stream.take(stream, 1).pipe(Stream.runCollect),
    )

    // Verify it matches direct check (no previous values on first call)
    const directInitial = ump.check({ email: 'a@b.com', name: 'Bob' })
    expect(initial).toEqual(directInitial)
    expect(initial?.name.enabled).toBe(false)

    const ready = Effect.runSync(Deferred.make<void>())
    const fiber = Effect.runFork(
      Stream.take(stream, 2).pipe(
        Stream.tap(() => Deferred.succeed(ready, undefined)),
        Stream.runCollect,
      ),
    )

    await Effect.runPromise(Deferred.await(ready))
    await Effect.runPromise(
      SubscriptionRef.set(ref, { email: '', name: 'Bob' }),
    )

    const items = await Effect.runPromise(Fiber.join(fiber))

    // The second emission should match a direct check with prev values
    const directNext = ump.check({ email: '', name: 'Bob' }, undefined, {
      email: 'a@b.com',
      name: 'Bob',
    })
    expect(items[1]).toEqual(directNext)
    expect(items[1]?.name.enabled).toBe(true)
  })

  test('passes extracted conditions to ump.check when state changes', async () => {
    const ump = umpire<
      { companyName: { required: true } },
      { plan: 'personal' | 'business' }
    >({
      fields: { companyName: { required: true } },
      rules: [
        enabledWhen(
          'companyName',
          (_values, conditions) => conditions.plan === 'business',
        ),
      ],
    })
    const ref = makeRef({
      values: { companyName: undefined },
      conditions: { plan: 'personal' as const },
    })
    const stream = availabilityStream(ump, ref, {
      select: (s) => s.values,
      conditions: (s) => s.conditions,
    })

    const ready = Effect.runSync(Deferred.make<void>())
    const fiber = Effect.runFork(
      Stream.take(stream, 2).pipe(
        Stream.tap(() => Deferred.succeed(ready, undefined)),
        Stream.runCollect,
      ),
    )

    await Effect.runPromise(Deferred.await(ready))
    await Effect.runPromise(
      SubscriptionRef.set(ref, {
        values: { companyName: undefined },
        conditions: { plan: 'business' },
      }),
    )

    const items = await Effect.runPromise(Fiber.join(fiber))

    expect(items[0]?.companyName).toMatchObject({
      enabled: false,
      required: false,
    })
    expect(items[1]?.companyName).toMatchObject({
      enabled: true,
      required: true,
      satisfied: false,
    })
  })

  test('stops emitting after fiber interruption', async () => {
    const ump = umpire({
      fields: { count: {} },
      rules: [],
    })
    const ref = makeRef({ count: 0 })
    const stream = availabilityStream(ump, ref, {
      select: (s) => ({ count: s.count }),
    })

    const items: Array<unknown> = []
    const fiber = Effect.runFork(
      Stream.runForEach(stream, (a) =>
        Effect.sync(() => {
          items.push(a)
        }),
      ),
    )

    await Effect.runPromise(Effect.yieldNow)
    const countAfterInitial = items.length
    expect(countAfterInitial).toBeGreaterThan(0)

    await Effect.runPromise(Fiber.interrupt(fiber))

    await Effect.runPromise(SubscriptionRef.set(ref, { count: 5 }))

    expect(items.length).toBe(countAfterInitial)
  })
})
