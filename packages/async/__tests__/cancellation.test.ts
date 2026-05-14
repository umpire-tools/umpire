import { umpire, anyOf, enabledWhen, oneOf } from '@umpire/async'
import { describe, test, expect } from 'bun:test'

function never<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

function delayedFailure(message: string, ms = 100): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms)
  })
}

describe('cancellation', () => {
  test('pre-aborted external signal causes check to throw', async () => {
    const controller = new AbortController()
    controller.abort()

    const ump = umpire({
      fields: { alpha: {} },
      rules: [],
    })

    await expect(
      ump.check({ alpha: 'x' }, undefined, undefined, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('auto-cancels previous check when a new check is started', async () => {
    let resolveFirst: (v: boolean) => void
    const firstCheckReady = new Promise<boolean>((r) => {
      resolveFirst = r
    })
    let firstAborted = false

    const ump = umpire({
      fields: { alpha: {} },
      rules: [
        enabledWhen('alpha', async () => {
          resolveFirst(true)
          await new Promise((r) => setTimeout(r, 300))
          return true
        }),
      ],
      onAbort: () => {
        firstAborted = true
      },
    })

    const firstPromise = ump.check({ alpha: 'x' })
    const firstSettled = firstPromise.catch(() => {})
    await firstCheckReady

    const result = await ump.check({ alpha: 'x' })
    expect(result.alpha.enabled).toBe(true)
    expect(firstAborted).toBe(true)

    await firstSettled
  })

  test('auto-cancel rejects without waiting for hanging rule predicates', async () => {
    let calls = 0
    const ump = umpire({
      fields: { alpha: {} },
      rules: [
        enabledWhen('alpha', async () => {
          calls += 1
          return calls === 1 ? never<boolean>() : true
        }),
      ],
    })

    const firstResult = ump.check({ alpha: 'x' }).then(
      () => null,
      (error) => error,
    )
    const result = await ump.check({ alpha: 'x' })

    expect(result.alpha.enabled).toBe(true)
    await expect(
      Promise.race([firstResult, delayedFailure('first check hung')]),
    ).resolves.toMatchObject({ name: 'AbortError' })
  })

  test('auto-cancel rejects without waiting for hanging dynamic reasons', async () => {
    let reasonCalls = 0
    const ump = umpire({
      fields: { alpha: {} },
      rules: [
        enabledWhen('alpha', () => false, {
          reason: async () => {
            reasonCalls += 1
            return reasonCalls === 1 ? never<string>() : 'not ready'
          },
        }),
      ],
    })

    const firstResult = ump.check({ alpha: 'x' }).then(
      () => null,
      (error) => error,
    )
    const result = await ump.check({ alpha: 'x' })

    expect(result.alpha.reason).toBe('not ready')
    await expect(
      Promise.race([firstResult, delayedFailure('first check hung')]),
    ).resolves.toMatchObject({ name: 'AbortError' })
  })

  test('auto-cancel rejects without waiting for hanging oneOf active branches', async () => {
    let calls = 0
    const ump = umpire({
      fields: { alpha: {}, beta: {} },
      rules: [
        oneOf(
          'choice',
          { primary: ['alpha'], secondary: ['beta'] },
          {
            activeBranch: async () => {
              calls += 1
              return calls === 1 ? never<'primary'>() : 'primary'
            },
          },
        ),
      ],
    })

    const firstResult = ump.check({ alpha: 'x', beta: 'y' }).then(
      () => null,
      (error) => error,
    )
    const result = await ump.check({ alpha: 'x', beta: 'y' })

    expect(result.alpha.enabled).toBe(true)
    expect(result.beta.enabled).toBe(false)
    await expect(
      Promise.race([firstResult, delayedFailure('first check hung')]),
    ).resolves.toMatchObject({ name: 'AbortError' })
  })

  test('auto-cancel rejects without waiting for hanging composite rule members', async () => {
    let calls = 0
    const ump = umpire({
      fields: { alpha: {} },
      rules: [
        anyOf(
          enabledWhen('alpha', async () => {
            calls += 1
            return calls === 1 ? never<boolean>() : false
          }),
          enabledWhen('alpha', () => true),
        ),
      ],
    })

    const firstResult = ump.check({ alpha: 'x' }).then(
      () => null,
      (error) => error,
    )
    const result = await ump.check({ alpha: 'x' })

    expect(result.alpha.enabled).toBe(true)
    await expect(
      Promise.race([firstResult, delayedFailure('first check hung')]),
    ).resolves.toMatchObject({ name: 'AbortError' })
  })

  test('onAbort hook fires when evaluation is auto-cancelled', async () => {
    let abortFired = false

    const ump = umpire({
      fields: { alpha: {} },
      rules: [
        enabledWhen('alpha', async () => {
          await new Promise((r) => setTimeout(r, 50))
          return true
        }),
      ],
      onAbort: () => {
        abortFired = true
      },
    })

    const firstPromise = ump.check({ alpha: 'x' })
    const firstSettled = firstPromise.catch(() => {})
    await ump.check({ alpha: 'x' })
    await Promise.resolve()

    expect(abortFired).toBe(true)
    await firstSettled
  })

  test('onAbort receives the abort reason', async () => {
    let capturedReason: unknown = 'not-set'

    const ump = umpire({
      fields: { alpha: {} },
      rules: [
        enabledWhen('alpha', async () => {
          await new Promise((r) => setTimeout(r, 50))
          return true
        }),
      ],
      onAbort: (reason) => {
        capturedReason = reason
      },
    })

    const firstPromise = ump.check({ alpha: 'x' })
    const firstSettled = firstPromise.catch(() => {})
    await ump.check({ alpha: 'x' })
    await Promise.resolve()

    expect(capturedReason).toBeInstanceOf(Error)
    await firstSettled
  })

  test('does not throw when onAbort throws', async () => {
    const ump = umpire({
      fields: { alpha: {} },
      rules: [
        enabledWhen('alpha', async () => {
          await new Promise((r) => setTimeout(r, 10))
          return true
        }),
      ],
      onAbort: () => {
        throw new Error('onAbort error')
      },
    })

    const firstPromise = ump.check({ alpha: 'x' })
    const firstSettled = firstPromise.catch(() => {})
    const result = await ump.check({ alpha: 'x' })
    await firstSettled

    expect(result.alpha.enabled).toBe(true)
  })

  test('multiple rapid checks all complete successfully', async () => {
    const ump = umpire({
      fields: { alpha: {} },
      rules: [enabledWhen('alpha', async () => true)],
    })

    const check1 = ump.check({ alpha: 'a' }).catch(() => null)
    const check2 = ump.check({ alpha: 'b' }).catch(() => null)
    const check3 = ump.check({ alpha: 'c' })

    const result = await check3
    await Promise.all([check1, check2])

    // Earlier checks are aborted by auto-cancel; only the latest check should
    // be asserted as successful.
    expect(result.alpha.enabled).toBe(true)
  })

  test('external signal cancels play()', async () => {
    const controller = new AbortController()
    const ump = umpire({
      fields: { a: {} },
      rules: [],
    })
    controller.abort()
    await expect(
      ump.play(
        { values: { a: 'x' } },
        { values: { a: 'y' } },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('external signal cancels scorecard()', async () => {
    const controller = new AbortController()
    const ump = umpire({
      fields: { a: {} },
      rules: [],
    })
    controller.abort()
    await expect(
      ump.scorecard({ values: { a: 'x' } }, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('falls back when AbortSignal.any is unavailable', async () => {
    const originalAny = (AbortSignal as any).any
    ;(AbortSignal as any).any = undefined

    try {
      const external = new AbortController()
      const ump = umpire({
        fields: { alpha: {} },
        rules: [enabledWhen('alpha', async () => true)],
      })

      const result = await ump.check(
        { alpha: 'x' },
        undefined,
        undefined,
        external.signal,
      )
      expect(result.alpha.enabled).toBe(true)
    } finally {
      ;(AbortSignal as any).any = originalAny
    }
  })

  test('fallback composed signal observes pre-aborted external signals', async () => {
    const originalAny = (AbortSignal as any).any
    ;(AbortSignal as any).any = undefined

    try {
      const external = new AbortController()
      external.abort('external')
      const ump = umpire({
        fields: { alpha: {} },
        rules: [enabledWhen('alpha', async () => true)],
      })

      await expect(
        ump.check({ alpha: 'x' }, undefined, undefined, external.signal),
      ).rejects.toBe('external')
    } finally {
      ;(AbortSignal as any).any = originalAny
    }
  })
})
