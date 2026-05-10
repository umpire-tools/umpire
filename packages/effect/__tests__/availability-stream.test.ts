import { umpire } from '@umpire/core'
import { Effect, Fiber, Stream, SubscriptionRef } from 'effect'
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

    expect(first?.name).toMatchObject({ satisfied: true })
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

    // Fork a fiber that collects stream emissions into an array
    const items: Array<unknown> = []
    const fiber = Effect.runFork(
      Stream.runForEach(stream, (a) =>
        Effect.sync(() => {
          items.push(a)
        }),
      ),
    )

    // Wait a tick for the initial emission to land
    await new Promise((r) => setTimeout(r, 50))

    // Update the ref — this triggers a new emission
    await Effect.runPromise(
      SubscriptionRef.set(ref, { name: undefined as unknown as string }),
    )

    // Wait for the update emission to be collected
    await new Promise((r) => setTimeout(r, 50))

    // Interrupt the fiber to stop collecting
    await Effect.runPromise(Fiber.interrupt(fiber))

    expect(items.length).toBeGreaterThanOrEqual(2)
    // Verify the updated emission has unsatisfied name
    const updated = items[1] as { name: { satisfied: boolean } }
    expect(updated.name.satisfied).toBe(false)
  })

  test('passes previous values to ump.check on subsequent emissions', async () => {
    const ump = umpire({
      fields: { email: { required: true }, name: {} },
      rules: [],
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

    // Collect second emission after update
    const items: Array<unknown> = []
    const fiber = Effect.runFork(
      Stream.drop(stream, 1).pipe(
        Stream.runForEach((a) =>
          Effect.sync(() => {
            items.push(a)
          }),
        ),
      ),
    )

    // Update ref to trigger next emission
    await Effect.runPromise(
      SubscriptionRef.set(ref, { email: '', name: 'Bob' }),
    )

    await new Promise((r) => setTimeout(r, 50))
    await Effect.runPromise(Fiber.interrupt(fiber))

    // The second emission should match a direct check with prev values
    const directNext = ump.check({ email: '', name: 'Bob' }, undefined, {
      email: 'a@b.com',
      name: 'Bob',
    })
    expect(items[0]).toEqual(directNext)
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

    // Wait for initial emission
    await new Promise((r) => setTimeout(r, 50))

    // Capture count after initial, then interrupt
    const countAfterInitial = items.length
    await Effect.runPromise(Fiber.interrupt(fiber))

    // Update ref after interruption — should NOT produce new emissions
    await Effect.runPromise(SubscriptionRef.set(ref, { count: 5 }))

    // Wait in case of delayed emissions
    await new Promise((r) => setTimeout(r, 100))

    // No new emissions after interruption
    expect(items.length).toBe(countAfterInitial)
  })
})
