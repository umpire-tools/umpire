import { enabledWhen as coreEnabledWhen } from '@umpire/core'
import { describe, expect, test } from 'bun:test'
import {
  isAsyncRule,
  isAsyncSafeParseValidator,
  toAsyncRule,
} from '../src/guards.js'

describe('async guards', () => {
  test('detects async safeParse validators', () => {
    expect(
      isAsyncSafeParseValidator({
        safeParseAsync: async () => ({ success: true }),
      }),
    ).toBe(true)
    expect(isAsyncSafeParseValidator(null)).toBe(false)
    expect(isAsyncSafeParseValidator({ safeParseAsync: true })).toBe(false)
  })

  test('detects async rules', () => {
    const rule = {
      __async: true,
      type: 'custom',
      targets: ['a'],
      sources: [],
      evaluate: async () => new Map(),
    }

    expect(isAsyncRule(rule)).toBe(true)
    expect(isAsyncRule(null)).toBe(false)
    expect(isAsyncRule({ __async: false })).toBe(false)
  })

  test('returns async rules unchanged', () => {
    const rule = {
      __async: true as const,
      type: 'custom',
      targets: ['a'],
      sources: [],
      evaluate: async () => new Map(),
    }

    expect(toAsyncRule(rule)).toBe(rule)
  })

  test('wraps core rules and preserves metadata', async () => {
    const coreRule = coreEnabledWhen('a', () => true)
    const asyncRule = toAsyncRule(coreRule)

    expect(asyncRule.__async).toBe(true)
    expect(asyncRule.type).toBe('enabledWhen')
    expect((asyncRule as any)._umpire).toBe((coreRule as any)._umpire)

    const result = await asyncRule.evaluate(
      { a: 'x' },
      {},
      undefined,
      { a: {} },
      {},
      new AbortController().signal,
    )

    expect(result.get('a')?.enabled).toBe(true)
  })
})
