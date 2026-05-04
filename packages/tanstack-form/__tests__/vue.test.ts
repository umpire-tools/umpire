import { describe, it, expect, mock } from 'bun:test'
import { enabledWhen, umpire } from '@umpire/core'
import { useUmpireForm, UmpireFormSubscribe } from '../src/vue.js'

describe('useUmpireForm', () => {
  it('is a function', () => {
    expect(typeof useUmpireForm).toBe('function')
  })

  it('field returns object with correct property names', () => {
    const engine = umpire({
      fields: { country: {}, state: {} },
      rules: [enabledWhen('state', (v: any) => v.country === 'US')],
    })

    const form = {
      store: new (class {
        state = { values: { country: 'US', state: 'CA' } }
        get() {
          return this.state
        }
        subscribe(_listener: any) {
          return { unsubscribe: () => {} }
        }
      })(),
      setFieldValue(_name: string, _value: unknown) {},
    }

    const umpireForm = useUmpireForm(form as any, engine)
    const f = umpireForm.field('state')

    expect(f).toHaveProperty('enabled')
    expect(f).toHaveProperty('available')
    expect(f).toHaveProperty('disabled')
    expect(f).toHaveProperty('required')
    expect(f).toHaveProperty('satisfied')
    expect(f).toHaveProperty('fair')
    expect(f).toHaveProperty('reason')
    expect(f).toHaveProperty('reasons')
  })

  it('available returns same value as enabled', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', (v: any) => v.a === 'yes')],
    })

    const form = {
      store: new (class {
        state = { values: { a: 'yes', b: 'hello' } }
        get() {
          return this.state
        }
        subscribe(_listener: any) {
          return { unsubscribe: () => {} }
        }
      })(),
      setFieldValue(_name: string, _value: unknown) {},
    }

    const umpireForm = useUmpireForm(form as any, engine)
    const f = umpireForm.field('b')

    expect(f.available).toBe(f.enabled)
    expect(f.available).toBe(true)

    const fA = umpireForm.field('a')
    expect(fA.available).toBe(fA.enabled)
    expect(fA.available).toBe(true)
  })

  it('disabled is opposite of enabled', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', (v: any) => v.a === 'yes')],
    })

    const form = {
      store: new (class {
        state = { values: { a: 'no', b: 'hello' } }
        get() {
          return this.state
        }
        subscribe(_listener: any) {
          return { unsubscribe: () => {} }
        }
      })(),
      setFieldValue(_name: string, _value: unknown) {},
    }

    const umpireForm = useUmpireForm(form as any, engine)
    const f = umpireForm.field('b')

    expect(f.enabled).toBe(false)
    expect(f.disabled).toBe(true)
  })

  it('fouls returns an array', () => {
    const engine = umpire({
      fields: { x: {} },
      rules: [],
    })

    const form = {
      store: new (class {
        state = { values: { x: 'a' } }
        get() {
          return this.state
        }
        subscribe(_listener: any) {
          return { unsubscribe: () => {} }
        }
      })(),
      setFieldValue(_name: string, _value: unknown) {},
    }

    const umpireForm = useUmpireForm(form as any, engine)
    expect(Array.isArray(umpireForm.fouls)).toBe(true)
  })

  it('applyStrike calls setFieldValue for each foul', () => {
    const engine = umpire({
      fields: { x: { required: true }, y: {} },
      rules: [enabledWhen('y', (v: any) => v.x !== null)],
    })

    const setFieldCalls: Array<{ name: string; value: unknown }> = []
    const form = {
      store: new (class {
        state = { values: { x: 'hello', y: 'world' } }
        get() {
          return this.state
        }
        subscribe(_listener: any) {
          return { unsubscribe: () => {} }
        }
      })(),
      setFieldValue(name: string, value: unknown) {
        setFieldCalls.push({ name, value })
      },
    }

    const umpireForm = useUmpireForm(form as any, engine, { strike: true })
    expect(Array.isArray(umpireForm.fouls)).toBe(true)

    umpireForm.applyStrike()
    expect(setFieldCalls).toEqual([])
  })
})

describe('UmpireFormSubscribe', () => {
  it('is a Vue component with name UmpireFormSubscribe', () => {
    expect(UmpireFormSubscribe).toBeDefined()
    expect(typeof UmpireFormSubscribe).toBe('object')
  })

  it('has correct props definition', () => {
    expect((UmpireFormSubscribe as any).name).toBe('UmpireFormSubscribe')
    const props = (UmpireFormSubscribe as any).props
    expect(props).toHaveProperty('form')
    expect(props).toHaveProperty('engine')
    expect(props).toHaveProperty('conditions')
    expect(props).toHaveProperty('strike')
    expect(props.form.required).toBe(true)
    expect(props.engine.required).toBe(true)
  })

  it('renders default slot with umpireForm via setup', () => {
    const engine = umpire({
      fields: { a: {} },
      rules: [],
    })

    const form = {
      store: new (class {
        state = { values: { a: 'test' } }
        get() {
          return this.state
        }
        subscribe(_l: any) {
          return { unsubscribe: () => {} }
        }
      })(),
      setFieldValue(_name: string, _value: unknown) {},
    }

    const slotFn = mock((_props: any) => 'vnode')
    const setup = (UmpireFormSubscribe as any).setup
    const renderFn = setup(
      { form, engine },
      { slots: { default: slotFn }, emit: () => {} },
    )

    renderFn()

    expect(slotFn).toHaveBeenCalledTimes(1)
    expect(slotFn).toHaveBeenCalledWith({
      umpireForm: expect.objectContaining({
        field: expect.any(Function),
        fouls: expect.any(Array),
        applyStrike: expect.any(Function),
      }),
    })

    const slotArg = (slotFn as any).mock.calls[0][0]
    expect(slotArg.umpireForm.field('a').enabled).toBe(true)
    expect(slotArg.umpireForm.field('a').required).toBe(false)
  })
})
