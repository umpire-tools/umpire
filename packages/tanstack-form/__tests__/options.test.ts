import { fairWhen, umpire } from '@umpire/core'
import { describe, it, expect } from 'bun:test'
import { createUmpireFormOptions } from '../src/options.js'

describe('createUmpireFormOptions', () => {
  type Conditions = { mode: 'edit' }
  type FormApi = {
    state: { values: Record<string, unknown> }
    setFieldValue(name: string, value: unknown): void
    resetField?(name: string): void
  }
  type Listener = (opts: { formApi: FormApi }) => void
  type OptionsResult = {
    listeners?: Record<string, Listener | number | undefined>
  }

  function resultWithListeners(value: Record<string, unknown>): OptionsResult {
    return value as OptionsResult
  }

  function listener(value: Listener | number | undefined): Listener {
    return value as Listener
  }

  it('returns empty object when strike is falsy', () => {
    const engine = umpire({ fields: { email: {} }, rules: [] })
    const result = createUmpireFormOptions(engine)
    expect(result).toEqual({})
  })

  it('produces onChange listener when strike is true', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [
        fairWhen('email', (v) => String(v).includes('@'), {
          reason: 'Bad email',
        }),
      ],
    })

    const result = createUmpireFormOptions(engine, { strike: true })
    const listeners = resultWithListeners(result).listeners
    expect(listeners).toBeDefined()
    expect(listeners?.onChange).toBeInstanceOf(Function)
  })

  it('initializes previousSnapshot on first call (no strikes applied)', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [
        fairWhen('email', (v) => String(v).includes('@'), {
          reason: 'Bad email',
        }),
      ],
    })

    const result = createUmpireFormOptions(engine, { strike: true })
    const setFieldValueCalls: Array<[string, unknown]> = []
    const formApi = {
      state: { values: { email: 'test@example.com' } },
      setFieldValue(name: string, value: unknown) {
        setFieldValueCalls.push([name, value])
      },
    }

    // First call initializes snapshot, no strike
    listener(resultWithListeners(result).listeners?.onChange)({ formApi })
    expect(setFieldValueCalls).toHaveLength(0)
  })

  it('applies strike on foul transition', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [
        fairWhen('email', (v) => String(v).includes('@'), {
          reason: 'Bad email',
        }),
      ],
    })

    const result = createUmpireFormOptions(engine, { strike: true })
    let values = { email: 'test@example.com' }
    const setFieldValueCalls: Array<[string, unknown]> = []

    const formApi = {
      get state() {
        return { values }
      },
      setFieldValue(name: string, value: unknown) {
        setFieldValueCalls.push([name, value])
        values = { ...values, [name]: value }
      },
    }

    // First call — initializes snapshot, no strike
    listener(resultWithListeners(result).listeners?.onChange)({ formApi })
    expect(setFieldValueCalls).toHaveLength(0)

    // Change to a foul value — should trigger strike restoring to suggested value (undefined)
    values = { email: 'bad' }
    listener(resultWithListeners(result).listeners?.onChange)({ formApi })
    expect(setFieldValueCalls).toHaveLength(1)
    expect(setFieldValueCalls[0][0]).toBe('email')
    expect(setFieldValueCalls[0][1]).toBeUndefined()
  })

  it('produces onBlur listener instead when events contains onBlur', () => {
    const engine = umpire({
      fields: { a: {} },
      rules: [],
    })

    const result = createUmpireFormOptions(engine, {
      strike: { events: ['onBlur'] },
    })

    const listeners = resultWithListeners(result).listeners
    expect(listeners?.onBlur).toBeInstanceOf(Function)
    expect(listeners?.onChange).toBeUndefined()
  })

  it('produces both onChange and onBlur listeners when both events configured', () => {
    const engine = umpire({
      fields: { a: {} },
      rules: [],
    })

    const result = createUmpireFormOptions(engine, {
      strike: { events: ['onChange', 'onBlur'] },
    })

    const listeners = resultWithListeners(result).listeners
    expect(listeners?.onChange).toBeInstanceOf(Function)
    expect(listeners?.onBlur).toBeInstanceOf(Function)
  })

  it('produces onChangeDebounceMs when debounceMs is set', () => {
    const engine = umpire({
      fields: { a: {} },
      rules: [],
    })

    const result = createUmpireFormOptions(engine, {
      strike: { debounceMs: 300 },
    })

    const listeners = resultWithListeners(result).listeners
    expect(listeners?.onChange).toBeInstanceOf(Function)
    expect(listeners?.onChangeDebounceMs).toBe(300)
  })

  it('calls resetField instead of setFieldValue when mode is resetField', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [
        fairWhen('email', (v) => String(v).includes('@'), {
          reason: 'Bad email',
        }),
      ],
    })

    const result = createUmpireFormOptions(engine, {
      strike: { mode: 'resetField' },
    })
    let values = { email: 'test@example.com' }
    const resetFieldCalls: string[] = []
    const setFieldValueCalls: Array<[string, unknown]> = []

    const formApi = {
      get state() {
        return { values }
      },
      setFieldValue(name: string, value: unknown) {
        // should NOT be called in resetField mode
        setFieldValueCalls.push([name, value])
      },
      resetField(name: string) {
        resetFieldCalls.push(name)
      },
    }

    // First call initializes
    listener(resultWithListeners(result).listeners?.onChange)({ formApi })
    expect(resetFieldCalls).toHaveLength(0)

    // Second call triggers foul
    values = { email: 'bad' }
    listener(resultWithListeners(result).listeners?.onChange)({ formApi })
    expect(resetFieldCalls).toHaveLength(1)
    expect(resetFieldCalls[0]).toBe('email')
    expect(setFieldValueCalls).toHaveLength(0)
  })

  it('conditions function is called with formApi to resolve conditions', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [
        fairWhen(
          'email',
          (v, conditions) =>
            conditions?.mode === 'edit' || String(v).includes('@'),
          { reason: 'Bad email' },
        ),
      ],
    } satisfies Parameters<typeof umpire<{ email: {} }, Conditions>>[0])

    const capturedApis: unknown[] = []
    const result = createUmpireFormOptions(engine, {
      strike: true,
      conditions: (formApi: unknown) => {
        capturedApis.push(formApi)
        return { mode: 'edit' }
      },
    })

    let values = { email: 'bad' }
    const setFieldValueCalls: Array<[string, unknown]> = []
    const formApi = {
      get state() {
        return { values }
      },
      setFieldValue(name: string, value: unknown) {
        setFieldValueCalls.push([name, value])
        values = { ...values, [name]: value }
      },
    }

    // First call initializes
    listener(resultWithListeners(result).listeners?.onChange)({ formApi })
    expect(capturedApis).toHaveLength(1)
    expect(capturedApis[0]).toBe(formApi)

    // Second call — mode is 'edit' so fair is true, no foul
    listener(resultWithListeners(result).listeners?.onChange)({ formApi })
    expect(setFieldValueCalls).toHaveLength(0)
  })

  it('conditions passed as plain object work directly', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [
        fairWhen(
          'email',
          (v, conditions) =>
            conditions?.mode === 'edit' || String(v).includes('@'),
          { reason: 'Bad email' },
        ),
      ],
    } satisfies Parameters<typeof umpire<{ email: {} }, Conditions>>[0])

    const result = createUmpireFormOptions(engine, {
      strike: true,
      conditions: { mode: 'edit' },
    })

    let values = { email: 'bad' }
    const setFieldValueCalls: Array<[string, unknown]> = []
    const formApi = {
      get state() {
        return { values }
      },
      setFieldValue(name: string, value: unknown) {
        setFieldValueCalls.push([name, value])
        values = { ...values, [name]: value }
      },
    }

    // First call initializes
    listener(resultWithListeners(result).listeners?.onChange)({ formApi })

    // Second call — conditions are static { mode: 'edit' }, so fair is true, no foul
    listener(resultWithListeners(result).listeners?.onChange)({ formApi })
    expect(setFieldValueCalls).toHaveLength(0)
  })

  it('two separate calls to createUmpireFormOptions do not share snapshots', () => {
    const engine = umpire({
      fields: { x: {} },
      rules: [fairWhen('x', (v) => String(v).length > 0, { reason: 'Empty' })],
    })

    const opts1 = createUmpireFormOptions(engine, { strike: true })
    const opts2 = createUmpireFormOptions(engine, { strike: true })

    const calls1: Array<[string, unknown]> = []
    const calls2: Array<[string, unknown]> = []

    let vals1 = { x: 'hello' }
    const api1 = {
      get state() {
        return { values: vals1 }
      },
      setFieldValue(name: string, value: unknown) {
        calls1.push([name, value])
        vals1 = { ...vals1, [name]: value }
      },
    }

    let vals2 = { x: 'world' }
    const api2 = {
      get state() {
        return { values: vals2 }
      },
      setFieldValue(name: string, value: unknown) {
        calls2.push([name, value])
        vals2 = { ...vals2, [name]: value }
      },
    }

    // Initialize both
    listener(resultWithListeners(opts1).listeners?.onChange)({ formApi: api1 })
    listener(resultWithListeners(opts2).listeners?.onChange)({ formApi: api2 })

    // Trigger foul on opts1 only
    vals1 = { x: '' }
    listener(resultWithListeners(opts1).listeners?.onChange)({ formApi: api1 })
    expect(calls1).toHaveLength(1)
    expect(calls1[0][0]).toBe('x')

    // opts2 should NOT have been affected — its snapshot is independent
    expect(calls2).toHaveLength(0)
  })

  it('returns listeners key at top level for spread compatibility', () => {
    const engine = umpire({
      fields: { a: {} },
      rules: [],
    })

    const result = createUmpireFormOptions(engine, { strike: true })
    expect(result).toHaveProperty('listeners')
    expect(result.listeners).toBeDefined()
  })
})
