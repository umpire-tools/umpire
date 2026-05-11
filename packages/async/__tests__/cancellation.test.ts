import { umpire, enabledWhen } from '@umpire/async'
import { describe, test, expect } from 'bun:test'

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
    ).rejects.toThrow()
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
    await firstCheckReady

    const result = await ump.check({ alpha: 'x' })
    expect(result.alpha.enabled).toBe(true)
    expect(firstAborted).toBe(true)

    await firstPromise
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

    ump.check({ alpha: 'x' })
    await ump.check({ alpha: 'x' })
    await new Promise((r) => setTimeout(r, 100))

    expect(abortFired).toBe(true)
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

    ump.check({ alpha: 'x' })
    await ump.check({ alpha: 'x' })
    await new Promise((r) => setTimeout(r, 100))

    expect(capturedReason).toBeDefined()
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

    ump.check({ alpha: 'x' })
    const result = await ump.check({ alpha: 'x' })

    expect(result.alpha.enabled).toBe(true)
  })

  test('multiple rapid checks all complete successfully', async () => {
    const ump = umpire({
      fields: { alpha: {} },
      rules: [enabledWhen('alpha', async () => true)],
    })

    const results = await Promise.all([
      ump.check({ alpha: 'a' }),
      ump.check({ alpha: 'b' }),
      ump.check({ alpha: 'c' }),
    ])

    expect(results).toHaveLength(3)
    results.forEach((r) => expect(r.alpha.enabled).toBe(true))
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
    ).rejects.toThrow()
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
    ).rejects.toThrow()
  })
})
