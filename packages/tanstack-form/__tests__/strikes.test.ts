import { describe, expect, it } from 'bun:test'
import type { AvailabilityMap, Foul } from '@umpire/core'
import { formStrike, formStrikeDisabled } from '../src/strikes.js'

describe('strike helpers', () => {
  type Fields = { enabled: {}; disabled: {}; missing: {} }

  const fouls = [
    { field: 'enabled', suggestedValue: 'keep-editing' },
    { field: 'disabled', suggestedValue: undefined },
    { field: 'missing', suggestedValue: null },
  ] as Foul<Fields>[]

  it('applies every foul for manual strikes', () => {
    const calls: Array<[string, unknown]> = []

    formStrike(fouls, (name, value) => {
      calls.push([name, value])
    })

    expect(calls).toEqual([
      ['enabled', 'keep-editing'],
      ['disabled', undefined],
      ['missing', null],
    ])
  })

  it('only applies fouls for fields that are explicitly disabled', () => {
    const availability = {
      enabled: { enabled: true },
      disabled: { enabled: false },
    } as AvailabilityMap<Fields>
    const calls: Array<[string, unknown]> = []

    formStrikeDisabled(fouls, availability, (name, value) => {
      calls.push([name, value])
    })

    expect(calls).toEqual([['disabled', undefined]])
  })
})
