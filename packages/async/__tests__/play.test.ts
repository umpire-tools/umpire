import { umpire, enabledWhen } from '@umpire/async'
import { describe, test, expect } from 'bun:test'

describe('async play()', () => {
  test('suggests reset when field becomes disabled and still holds value', async () => {
    const ump = umpire({
      fields: { toggle: {}, target: { default: 'default' } },
      rules: [enabledWhen('target', async (v: any) => v.toggle === 'on')],
    })

    const fouls = await ump.play(
      { values: { toggle: 'on', target: 'custom' } },
      { values: { toggle: 'off', target: 'custom' } },
    )

    expect(fouls).toHaveLength(1)
    expect(fouls[0].field).toBe('target')
    expect(fouls[0].suggestedValue).toBe('default')
  })

  test('no foul when value already matches default', async () => {
    const ump = umpire({
      fields: { toggle: {}, target: { default: 'default' } },
      rules: [enabledWhen('target', async (v: any) => v.toggle === 'on')],
    })

    const fouls = await ump.play(
      { values: { toggle: 'on', target: 'default' } },
      { values: { toggle: 'off', target: 'default' } },
    )

    expect(fouls).toHaveLength(0)
  })

  test('no foul when field was already disabled in before', async () => {
    const ump = umpire({
      fields: { toggle: {}, target: {} },
      rules: [enabledWhen('target', async (v: any) => v.toggle === 'on')],
    })

    const fouls = await ump.play(
      { values: { toggle: 'off', target: 'stale' } },
      { values: { toggle: 'off', target: 'stale' } },
    )

    expect(fouls).toHaveLength(0)
  })

  test('no foul when current value is null/unsatisfied', async () => {
    const ump = umpire({
      fields: { toggle: {}, target: { default: 'default' } },
      rules: [enabledWhen('target', async (v: any) => v.toggle === 'on')],
    })

    const fouls = await ump.play(
      { values: { toggle: 'on', target: 'custom' } },
      { values: { toggle: 'off', target: null } },
    )

    expect(fouls).toHaveLength(0)
  })

  test('suggests reset for multiple fields', async () => {
    const ump = umpire({
      fields: {
        toggle: {},
        dep1: { default: 'd1' },
        dep2: { default: 'd2' },
      },
      rules: [
        enabledWhen('dep1', async (v: any) => v.toggle === 'on'),
        enabledWhen('dep2', async (v: any) => v.toggle === 'on'),
      ],
    })

    const fouls = await ump.play(
      { values: { toggle: 'on', dep1: 'custom1', dep2: 'custom2' } },
      { values: { toggle: 'off', dep1: 'custom1', dep2: 'custom2' } },
    )

    expect(fouls).toHaveLength(2)
    expect(fouls[0].field).toBe('dep1')
    expect(fouls[0].suggestedValue).toBe('d1')
    expect(fouls[1].field).toBe('dep2')
    expect(fouls[1].suggestedValue).toBe('d2')
  })

  test('no default field gets undefined suggestedValue', async () => {
    const ump = umpire({
      fields: { toggle: {}, target: {} },
      rules: [enabledWhen('target', async (v: any) => v.toggle === 'on')],
    })

    const fouls = await ump.play(
      { values: { toggle: 'on', target: 'custom' } },
      { values: { toggle: 'off', target: 'custom' } },
    )

    expect(fouls).toHaveLength(1)
    expect(fouls[0].suggestedValue).toBeUndefined()
  })

  test('reason from rule is used in foul output', async () => {
    const ump = umpire({
      fields: { toggle: {}, target: {} },
      rules: [
        enabledWhen('target', async (v: any) => v.toggle === 'on', {
          reason: 'toggle must be on',
        }),
      ],
    })

    const fouls = await ump.play(
      { values: { toggle: 'on', target: 'custom' } },
      { values: { toggle: 'off', target: 'custom' } },
    )

    expect(fouls).toHaveLength(1)
    expect(fouls[0].reason).toBe('toggle must be on')
  })
})
