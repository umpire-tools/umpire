import { describe, it, expect, mock } from 'bun:test'
import { enabledWhen, fairWhen, umpire } from '@umpire/core'
import { createUmpireFormAdapter } from '../src/adapter.js'

describe('createUmpireFormAdapter', () => {
  it('getAvailability returns check results', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [
        fairWhen(
          'email',
          (v) => String((v as Record<string, unknown>).email).includes('@'),
          {
            reason: 'Invalid',
          },
        ),
      ],
    })

    const formValues = { email: 'bad' }
    const form = {
      get state() {
        return { values: formValues }
      },
      setFieldValue() {},
    }

    const adapter = createUmpireFormAdapter(form as never, engine)
    const availability = adapter.getAvailability()

    expect((availability as Record<string, { fair: boolean }>).email.fair).toBe(
      false,
    )
  })

  it('getField returns status with available/disabled aliases', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [
        enabledWhen('b', (v) => (v as Record<string, unknown>).a === 'yes'),
      ],
    })

    const form = {
      state: { values: { a: 'yes', b: 'hello' } },
      setFieldValue() {},
    }

    const adapter = createUmpireFormAdapter(form as never, engine)
    const field = adapter.getField('b')

    expect(field.enabled).toBe(true)
    expect(field.available).toBe(true)
    expect(field.disabled).toBe(false)
  })

  it('getField for unknown field returns default disabled status', () => {
    const engine = umpire({
      fields: { a: {} },
      rules: [],
    })

    const form = {
      state: { values: { a: 'hello' } },
      setFieldValue() {},
    }

    const adapter = createUmpireFormAdapter(form as never, engine)
    const field = adapter.getField('nonexistent')

    expect(field.enabled).toBe(false)
    expect(field.available).toBe(false)
    expect(field.disabled).toBe(true)
    expect(field.required).toBe(false)
    expect(field.satisfied).toBe(false)
    expect(field.fair).toBe(true)
    expect(field.reason).toBeNull()
    expect(field.reasons).toEqual([])
  })

  it('getFouls returns empty array on first call', () => {
    const engine = umpire({
      fields: { x: {} },
      rules: [],
    })

    const form = {
      state: { values: { x: 'a' } },
      setFieldValue() {},
    }

    const adapter = createUmpireFormAdapter(form as never, engine)
    const fouls = adapter.getFouls()

    expect(fouls).toEqual([])
  })

  it('getFouls returns fouls when values change between snapshots', () => {
    const engine = umpire({
      fields: { x: { required: true }, y: {} },
      rules: [
        enabledWhen('y', (v) => (v as Record<string, unknown>).x !== null),
      ],
    })

    const form = {
      state: { values: { x: 'hello', y: 'world' } },
      setFieldValue() {},
    }

    const adapter = createUmpireFormAdapter(form as never, engine)

    adapter.getFouls()

    form.state.values = { x: null, y: 'world' }

    const fouls = adapter.getFouls()
    expect(fouls.length).toBeGreaterThan(0)
    expect(fouls[0].field).toBe('y')
  })

  it('applyStrike calls setFieldValue for each foul', () => {
    const engine = umpire({
      fields: { x: {}, y: {} },
      rules: [
        enabledWhen('y', (v) => (v as Record<string, unknown>).x === 'yes'),
      ],
    })

    const setFieldCalls: Array<{ name: string; value: unknown }> = []
    const form = {
      state: { values: { x: 'yes', y: 'world' } },
      setFieldValue(name: string, value: unknown) {
        setFieldCalls.push({ name, value })
      },
    }

    const adapter = createUmpireFormAdapter(form as never, engine)

    adapter.getFouls()

    form.state.values = { x: 'no', y: 'world' }

    adapter.applyStrike()

    expect(setFieldCalls).toEqual([{ name: 'y', value: undefined }])
    adapter.applyStrike()
    expect(setFieldCalls).toEqual([{ name: 'y', value: undefined }])
  })

  it('applyStrike applies fouls already inspected by getFouls', () => {
    const engine = umpire({
      fields: { x: {}, y: {} },
      rules: [
        enabledWhen('y', (v) => (v as Record<string, unknown>).x === 'yes'),
      ],
    })

    const setFieldCalls: Array<{ name: string; value: unknown }> = []
    const form = {
      state: { values: { x: 'yes', y: 'world' } },
      setFieldValue(name: string, value: unknown) {
        setFieldCalls.push({ name, value })
      },
    }

    const adapter = createUmpireFormAdapter(form as never, engine)

    adapter.getFouls()
    form.state.values = { x: 'no', y: 'world' }

    const fouls = adapter.getFouls()
    expect(fouls.map((foul) => foul.field)).toEqual(['y'])

    adapter.applyStrike()

    expect(setFieldCalls).toEqual([{ name: 'y', value: undefined }])
    adapter.applyStrike()
    expect(setFieldCalls).toEqual([{ name: 'y', value: undefined }])
  })

  it('applyStrike is a no-op before any transition', () => {
    const engine = umpire({
      fields: { x: {}, y: {} },
      rules: [
        enabledWhen('y', (v) => (v as Record<string, unknown>).x === 'yes'),
      ],
    })

    const setFieldCalls: Array<{ name: string; value: unknown }> = []
    const form = {
      state: { values: { x: 'no', y: 'world' } },
      setFieldValue(name: string, value: unknown) {
        setFieldCalls.push({ name, value })
      },
    }

    const adapter = createUmpireFormAdapter(form as never, engine)
    adapter.applyStrike()

    expect(setFieldCalls).toEqual([])
  })

  it('adapters do not share snapshot state', () => {
    const engine = umpire({ fields: { x: {} }, rules: [] })
    const form1 = {
      state: { values: { x: 'a' } },
      setFieldValue() {},
    }
    const form2 = {
      state: { values: { x: 'b' } },
      setFieldValue() {},
    }

    const adapter1 = createUmpireFormAdapter(form1 as never, engine)
    const adapter2 = createUmpireFormAdapter(form2 as never, engine)

    adapter1.getFouls()
    const fouls2 = adapter2.getFouls()
    expect(fouls2).toEqual([])
  })

  it('custom setFieldValue option overrides default', () => {
    const engine = umpire({
      fields: { x: {}, y: {} },
      rules: [
        enabledWhen('y', (v) => (v as Record<string, unknown>).x === 'yes'),
      ],
    })

    const customCalls: Array<{ name: string; value: unknown }> = []
    const customSetFieldValue = (name: string, value: unknown) => {
      customCalls.push({ name, value })
    }

    const form = {
      state: { values: { x: 'yes', y: 'world' } },
      setFieldValue() {},
    }

    const adapter = createUmpireFormAdapter(form as never, engine, {
      setFieldValue: customSetFieldValue,
    })

    adapter.getFouls()
    form.state.values = { x: 'no', y: 'world' }
    adapter.applyStrike()

    expect(customCalls).toEqual([{ name: 'y', value: undefined }])
  })

  it('custom conditions function is called to resolve conditions', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [
        enabledWhen(
          'b',
          (_values, conditions) =>
            (conditions as Record<string, unknown>)?.mode === 'edit',
        ),
      ],
    })

    const form = {
      state: { values: { a: 'x', b: 'test' } },
      setFieldValue() {},
    }

    const conditionsFn = mock(() => ({ mode: 'edit' }))
    const adapter = createUmpireFormAdapter(form as never, engine, {
      conditions: conditionsFn,
    })

    const availability = adapter.getAvailability()
    expect(
      (availability as Record<string, { enabled: boolean }>).b.enabled,
    ).toBe(true)
    expect(conditionsFn).toHaveBeenCalled()
  })

  it('refresh resets previous snapshot to given values', () => {
    const engine = umpire({
      fields: { x: { required: true }, y: {} },
      rules: [
        enabledWhen('y', (v) => (v as Record<string, unknown>).x !== null),
      ],
    })

    const form = {
      state: { values: { x: 'hello', y: 'world' } },
      setFieldValue() {},
    }

    const adapter = createUmpireFormAdapter(form as never, engine)

    // Initialize snapshot with current values
    adapter.getFouls()

    // External change: values are updated, then refresh called
    form.state.values = { x: null, y: 'world' }
    adapter.refresh({ x: null, y: 'world' })

    // Values are the same as snapshot now, so getFouls should return empty
    const fouls = adapter.getFouls()
    expect(fouls).toEqual([])
  })
})
