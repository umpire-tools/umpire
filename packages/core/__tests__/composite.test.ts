import { describe, expect, test } from 'bun:test'
import {
  appendCompositeFailureReasons,
  getCompositeFailureReasons,
  getCompositeTargetEvaluation,
  combineCompositeResults,
} from '../src/composite.js'

describe('composite helpers', () => {
  test('appends the scalar reason when no reasons array is present', () => {
    const reasons: string[] = []

    appendCompositeFailureReasons(
      { enabled: false, reason: 'blocked' },
      reasons,
    )

    expect(reasons).toEqual(['blocked'])
    expect(
      getCompositeFailureReasons({ enabled: false, reason: 'blocked' }),
    ).toEqual(['blocked'])
  })

  test('returns an empty reasons array when the evaluation has no failure reason', () => {
    expect(
      getCompositeFailureReasons({ enabled: false, reason: null }),
    ).toEqual([])
  })

  test('falls back to the scalar reason when reasons is an empty array', () => {
    expect(
      getCompositeFailureReasons({
        enabled: false,
        reason: 'blocked',
        reasons: [],
      }),
    ).toEqual(['blocked'])
  })

  test('combines failing fair results without fabricating reasons', () => {
    expect(
      combineCompositeResults('fair', 'and', [
        { enabled: true, fair: false, reason: null },
      ]),
    ).toEqual({
      enabled: true,
      fair: false,
      reason: null,
    })
  })

  test('does not include a reasons array for silent enabled failures', () => {
    expect(
      combineCompositeResults('enabled', 'and', [
        { enabled: false, reason: null, reasons: [] },
      ]),
    ).toEqual({
      enabled: false,
      reason: null,
    })
  })

  test('returns the default enabled target evaluation when the target is missing', () => {
    expect(getCompositeTargetEvaluation(new Map(), 'alpha')).toEqual({
      enabled: true,
      reason: null,
    })
  })
})
