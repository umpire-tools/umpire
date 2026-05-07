import { describe, it, expect, mock } from 'bun:test'
import { enabledWhen, fairWhen, umpire } from '@umpire/core'
import { nextTick } from 'vue'
import { useUmpireForm, UmpireFormSubscribe } from '../src/vue.js'

type Values = Record<string, unknown>
type StoreListener = (state: { values: Values }) => void
type Store = {
  state: { values: Values }
  get(): { values: Values }
  subscribe(listener: StoreListener): { unsubscribe(): void }
  setValues(values: Values): void
}
type Form = {
  store: Store
  setFieldValue(name: string, value: unknown): void
}
type SlotProps = {
  umpireForm: {
    field(name: string): { enabled: boolean; required: boolean }
    fouls: unknown[]
    applyStrike(): void
  }
}
type ComponentShape = {
  name?: string
  props?: Record<string, { required?: boolean }>
  setup?: (
    props: { form: Form; engine: typeof engineForSetup },
    context: {
      slots: { default?: (props: SlotProps) => unknown }
      emit: () => void
    },
  ) => () => unknown
}
const engineForSetup = umpire({ fields: { a: {} }, rules: [] })

function createStore(values: Values): Store {
  return new (class {
    state = { values }
    listeners = new Set<StoreListener>()
    get() {
      return this.state
    }
    subscribe(listener: StoreListener) {
      this.listeners.add(listener)
      return { unsubscribe: () => this.listeners.delete(listener) }
    }
    setValues(nextValues: Values) {
      this.state = { values: nextValues }
      for (const listener of this.listeners) {
        listener(this.state as never)
      }
    }
  })()
}

describe('useUmpireForm', () => {
  it('is a function', () => {
    expect(typeof useUmpireForm).toBe('function')
  })

  it('field returns object with correct property names', () => {
    const engine = umpire({
      fields: { country: {}, state: {} },
      rules: [enabledWhen('state', (v) => (v as Values).country === 'US')],
    })

    const form = {
      store: createStore({ country: 'US', state: 'CA' }),
      setFieldValue(_name: string, _value: unknown) {},
    }

    const umpireForm = useUmpireForm(form, engine)
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
      rules: [enabledWhen('b', (v) => (v as Values).a === 'yes')],
    })

    const form = {
      store: createStore({ a: 'yes', b: 'hello' }),
      setFieldValue(_name: string, _value: unknown) {},
    }

    const umpireForm = useUmpireForm(form, engine)
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
      rules: [enabledWhen('b', (v) => (v as Values).a === 'yes')],
    })

    const form = {
      store: createStore({ a: 'no', b: 'hello' }),
      setFieldValue(_name: string, _value: unknown) {},
    }

    const umpireForm = useUmpireForm(form, engine)
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
      store: createStore({ x: 'a' }),
      setFieldValue(_name: string, _value: unknown) {},
    }

    const umpireForm = useUmpireForm(form, engine)
    expect(Array.isArray(umpireForm.fouls)).toBe(true)
  })

  it('applyStrike calls setFieldValue for each foul', () => {
    const engine = umpire({
      fields: { x: { required: true }, y: {} },
      rules: [enabledWhen('y', (v) => (v as Values).x !== null)],
    })

    const setFieldCalls: Array<{ name: string; value: unknown }> = []
    const form = {
      store: createStore({ x: 'hello', y: 'world' }),
      setFieldValue(name: string, value: unknown) {
        setFieldCalls.push({ name, value })
      },
    }

    const umpireForm = useUmpireForm(form, engine, { strike: true })
    expect(Array.isArray(umpireForm.fouls)).toBe(true)

    umpireForm.applyStrike()
    expect(setFieldCalls).toEqual([])
  })

  it('tracks fouls without automatically applying strikes when strike is omitted', async () => {
    const engine = umpire({
      fields: { x: { required: true }, y: {} },
      rules: [enabledWhen('y', (v) => (v as Values).x !== null)],
    })

    const setFieldCalls: Array<{ name: string; value: unknown }> = []
    const store = createStore({ x: 'hello', y: 'world' })
    const form = {
      store,
      setFieldValue(name: string, value: unknown) {
        setFieldCalls.push({ name, value })
      },
    }

    const umpireForm = useUmpireForm(form, engine)
    expect(umpireForm.fouls).toEqual([])

    store.setValues({ x: null, y: 'world' })
    await nextTick()

    expect(umpireForm.fouls).toEqual([
      expect.objectContaining({ field: 'y', suggestedValue: undefined }),
    ])
    expect(setFieldCalls).toEqual([])

    umpireForm.applyStrike()
    expect(setFieldCalls).toEqual([{ name: 'y', value: undefined }])
  })

  it('field proxies are cached and expose fair reasons plus unknown defaults', () => {
    const engine = umpire({
      fields: { code: { required: true } },
      rules: [
        fairWhen('code', (value) => value !== 'bad', {
          reason: 'bad code',
        }),
      ],
    })

    const form = {
      store: createStore({ code: 'bad' }),
      setFieldValue(_name: string, _value: unknown) {},
    }

    const umpireForm = useUmpireForm(form, engine)
    const code = umpireForm.field('code')

    expect(code).toBe(umpireForm.field('code'))
    expect(code.enabled).toBe(true)
    expect(code.available).toBe(true)
    expect(code.disabled).toBe(false)
    expect(code.required).toBe(true)
    expect(code.satisfied).toBe(true)
    expect(code.fair).toBe(false)
    expect(code.reason).toBe('bad code')
    expect(code.reasons).toEqual(['bad code'])
    expect(code.error).toBeUndefined()

    const missing = umpireForm.field('missing')
    expect(missing.enabled).toBe(false)
    expect(missing.available).toBe(false)
    expect(missing.disabled).toBe(true)
    expect(missing.required).toBe(false)
    expect(missing.satisfied).toBe(false)
    expect(missing.fair).toBe(true)
    expect(missing.reason).toBeNull()
    expect(missing.reasons).toEqual([])
  })

  it('resolves condition functions and value containers', () => {
    const engine = umpire({
      fields: { state: {} },
      rules: [enabledWhen('state', (_v, ctx) => ctx?.allow === true)],
    } satisfies Parameters<typeof umpire<{ state: {} }, { allow: boolean }>>[0])

    const form = {
      store: createStore({ state: 'CA' }),
      setFieldValue(_name: string, _value: unknown) {},
    }

    expect(
      useUmpireForm(form, engine, {
        conditions: () => ({ allow: true }),
      }).field('state').enabled,
    ).toBe(true)

    expect(
      useUmpireForm(form, engine, {
        conditions: { value: { allow: false } },
      }).field('state').enabled,
    ).toBe(false)
  })
})

describe('UmpireFormSubscribe', () => {
  it('is a Vue component with name UmpireFormSubscribe', () => {
    expect(UmpireFormSubscribe).toBeDefined()
    expect(typeof UmpireFormSubscribe).toBe('object')
  })

  it('has correct props definition', () => {
    const component = UmpireFormSubscribe as ComponentShape
    expect(component.name).toBe('UmpireFormSubscribe')
    const props = component.props
    expect(props).toBeDefined()
    expect(props).toHaveProperty('form')
    expect(props).toHaveProperty('engine')
    expect(props).toHaveProperty('conditions')
    expect(props).toHaveProperty('strike')
    expect(props?.form.required).toBe(true)
    expect(props?.engine.required).toBe(true)
  })

  it('renders default slot with umpireForm via setup', () => {
    const engine = umpire({
      fields: { a: {} },
      rules: [],
    })

    const form = {
      store: createStore({ a: 'test' }),
      setFieldValue(_name: string, _value: unknown) {},
    }

    const slotFn = mock((_props: SlotProps) => 'vnode')
    const setup = (UmpireFormSubscribe as ComponentShape).setup
    expect(setup).toBeDefined()
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

    const slotArg = slotFn.mock.calls[0][0]
    expect(slotArg.umpireForm.field('a').enabled).toBe(true)
    expect(slotArg.umpireForm.field('a').required).toBe(false)
  })

  it('renders null when no default slot is provided', () => {
    const form = {
      store: createStore({ a: 'test' }),
      setFieldValue(_name: string, _value: unknown) {},
    }

    const setup = (UmpireFormSubscribe as ComponentShape).setup
    expect(setup).toBeDefined()
    const renderFn = setup(
      { form, engine: engineForSetup },
      { slots: {}, emit: () => {} },
    )

    expect(renderFn()).toBeNull()
  })
})
