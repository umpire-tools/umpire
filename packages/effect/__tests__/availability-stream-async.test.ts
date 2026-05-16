import { umpire as asyncUmpire, defineRule, enabledWhen } from '@umpire/async'
import { Deferred, Effect, Fiber, Stream, SubscriptionRef } from 'effect'
import { availabilityStreamAsync } from '../src/availability-stream-async.js'

function makeRef<S>(initial: S): SubscriptionRef.SubscriptionRef<S> {
  return Effect.runSync(SubscriptionRef.make(initial))
}

describe('availabilityStreamAsync', () => {
  test('emits the current availability on first emission', async () => {
    const ump = asyncUmpire({
      fields: { name: { required: true } },
      rules: [],
    })
    const ref = makeRef({ name: 'Alice' })
    const stream = availabilityStreamAsync(ump, ref, {
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
    const ump = asyncUmpire({
      fields: { name: { required: true } },
      rules: [],
    })
    const ref = makeRef({ name: 'Alice' })
    const stream = availabilityStreamAsync(ump, ref, {
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
    const ump = asyncUmpire({
      fields: { email: { required: true }, name: {} },
      rules: [
        defineRule({
          type: 'previous-email',
          targets: ['name'],
          sources: ['email'],
          evaluate: (values, _conditions, prev) =>
            Promise.resolve(
              new Map([
                [
                  'name',
                  {
                    enabled: values.email === '' && prev?.email === 'a@b.com',
                    reason: null,
                  },
                ],
              ]),
            ),
        }),
      ],
    })
    const ref = makeRef({ email: 'a@b.com', name: 'Bob' })
    const stream = availabilityStreamAsync(ump, ref, {
      select: (s) => ({ email: s.email, name: s.name }),
    })

    const [initial] = await Effect.runPromise(
      Stream.take(stream, 1).pipe(Stream.runCollect),
    )

    const directInitial = await ump.check({ email: 'a@b.com', name: 'Bob' })
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

    const directNext = await ump.check({ email: '', name: 'Bob' }, undefined, {
      email: 'a@b.com',
      name: 'Bob',
    })
    expect(items[1]).toEqual(directNext)
    expect(items[1]?.name.enabled).toBe(true)
  })

  test('works with async rule evaluate functions', async () => {
    const ump = asyncUmpire({
      fields: { name: { required: true } },
      rules: [
        defineRule({
          type: 'async-rule',
          targets: ['name'],
          sources: [],
          evaluate: async (values) =>
            new Map([
              ['name', { enabled: values.name === 'Alice', reason: null }],
            ]),
        }),
      ],
    })
    const ref = makeRef({ name: 'Alice' })
    const stream = availabilityStreamAsync(ump, ref, {
      select: (s) => ({ name: s.name }),
    })

    const [first] = await Effect.runPromise(
      Stream.take(stream, 1).pipe(Stream.runCollect),
    )

    expect(first?.name).toMatchObject({
      enabled: true,
      satisfied: true,
    })
  })

  test('passes extracted conditions to ump.check when state changes', async () => {
    const ump = asyncUmpire<
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
    const stream = availabilityStreamAsync(ump, ref, {
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

  test('interruption aborts in-flight async check', async () => {
    let wasAborted = false

    const ump = asyncUmpire({
      fields: { name: {} },
      rules: [
        defineRule({
          type: 'hanging-rule',
          targets: ['name'],
          sources: [],
          evaluate: async (
            _values,
            _conditions,
            _prev,
            _fields,
            _availability,
            signal,
          ) => {
            signal.addEventListener('abort', () => {
              wasAborted = true
            })
            await new Promise<void>((_resolve, reject) => {
              if (signal.aborted) {
                wasAborted = true
                reject(new Error('aborted'))
                return
              }
              const onAbort = () => {
                wasAborted = true
                reject(new Error('aborted'))
              }
              signal.addEventListener('abort', onAbort, { once: true })
            })
            return new Map([['name', { enabled: true, reason: null }]])
          },
        }),
      ],
    })
    const ref = makeRef({ name: 'Alice' })
    const stream = availabilityStreamAsync(ump, ref, {
      select: (s) => ({ name: s.name }),
    })

    const fiber = Effect.runFork(Stream.take(stream, 1).pipe(Stream.runCollect))

    await new Promise((resolve) => setTimeout(resolve, 100))

    await Effect.runPromise(Fiber.interrupt(fiber))

    expect(wasAborted).toBe(true)
  })

  test('rejected async check fails the stream', async () => {
    const ump = asyncUmpire({
      fields: { name: { required: true } },
      rules: [
        defineRule({
          type: 'failing-rule',
          targets: ['name'],
          sources: [],
          evaluate: async () => {
            throw new Error('async check failed')
          },
        }),
      ],
    })
    const ref = makeRef({ name: 'Alice' })
    const stream = availabilityStreamAsync(ump, ref, {
      select: (s) => ({ name: s.name }),
    })

    await expect(Effect.runPromise(Stream.runCollect(stream))).rejects.toThrow(
      'async check failed',
    )
  })

  test('availabilityStreamAsync is importable', () => {
    expect(availabilityStreamAsync).toBeDefined()
    expect(typeof availabilityStreamAsync).toBe('function')

    const ump = asyncUmpire({
      fields: { name: { required: true } },
      rules: [],
    })
    const ref = makeRef({ name: 'Alice' })
    const stream = availabilityStreamAsync(ump, ref, {
      select: (s) => ({ name: s.name }),
    })

    expect(stream).toBeDefined()
    expect(typeof stream.pipe).toBe('function')
  })
})
