import { describe, it, expect, mock } from 'bun:test'
import { createRoot, createSignal } from 'solid-js'
import type { Accessor, JSX } from 'solid-js'
import { enabledWhen, requires, umpire } from '@umpire/core'
import type { FieldDef } from '@umpire/core'
import {
  createUmpireForm,
  createUmpireFormComponents,
  UmpireFormSubscribe,
  UmpireFormContext,
} from '../src/solid.js'

function withRoot<T>(run: () => T) {
  let value!: T
  let dispose!: () => void

  createRoot((rootDispose) => {
    dispose = rootDispose
    value = run()
  })

  return { value, dispose }
}

const fields = {
  country: {},
  state: {},
  city: {},
} satisfies Record<string, FieldDef>

type Values = Record<string, unknown>
type Selector<T> = (state: { values: Values }) => T
type SolidForm = {
  useStore<T>(selector: Selector<T>): Accessor<T>
  setFieldValue(name: string, value: unknown): void
}
type Subscribe = (opts: {
  selector: Selector<Values>
  children(values: Accessor<Values>): JSX.Element
}) => JSX.Element
type UmpireFormLike = {
  field(name: string): {
    enabled: boolean
    available: boolean
    disabled: boolean
    required: boolean
    satisfied: boolean
    fair: boolean
    reason: string | null
    reasons: string[]
  }
  fouls: Array<{ field: string; suggestedValue: unknown }>
  applyStrike(): void
}

describe('createUmpireForm', () => {
  it('returns field status from engine', () => {
    const engine = umpire({
      fields,
      rules: [
        enabledWhen('state', (v) => (v as Values).country === 'US'),
        requires('city', 'state'),
      ],
    })

    const { value: umpireForm, dispose } = withRoot(() => {
      const form = {
        useStore: <T,>(selector: Selector<T>) => () =>
          selector({
            values: { country: 'Canada', state: 'ON', city: 'Toronto' },
          }),
        setFieldValue: () => {},
      } satisfies SolidForm
      return createUmpireForm(form, engine)
    })

    try {
      expect(umpireForm.field('country').enabled).toBe(true)
      expect(umpireForm.field('state').enabled).toBe(false)
      expect(umpireForm.field('state').disabled).toBe(true)
      expect(umpireForm.field('city').enabled).toBe(false)
    } finally {
      dispose()
    }
  })

  it('available alias matches enabled', () => {
    const engine = umpire({
      fields,
      rules: [enabledWhen('state', (v) => (v as Values).country === 'US')],
    })

    const { value: umpireForm, dispose } = withRoot(() => {
      const form = {
        useStore: <T,>(selector: Selector<T>) => () =>
          selector({ values: { country: 'US', state: 'CA', city: 'LA' } }),
        setFieldValue: () => {},
      } satisfies SolidForm
      return createUmpireForm(form, engine)
    })

    try {
      expect(umpireForm.field('country').available).toBe(
        umpireForm.field('country').enabled,
      )
      expect(umpireForm.field('state').available).toBe(
        umpireForm.field('state').enabled,
      )
      expect(umpireForm.field('city').available).toBe(
        umpireForm.field('city').enabled,
      )
    } finally {
      dispose()
    }
  })

  it('fouls returns fouls array on transition', async () => {
    const engine = umpire({
      fields,
      rules: [enabledWhen('state', (v) => (v as Values).country === 'US')],
    })

    const { value, dispose } = withRoot(() => {
      const [storeValues, setStoreValues] = createSignal({
        country: 'US',
        state: 'CA',
        city: 'LA',
      })
      const form = {
        useStore: <T,>(selector: Selector<T>) => () =>
          selector({ values: storeValues() }),
        setFieldValue: () => {},
      } satisfies SolidForm
      return {
        setStoreValues,
        form: createUmpireForm(form, engine),
      }
    })

    try {
      await Promise.resolve()
      expect(value.form.field('country').enabled).toBe(true)
      expect(value.form.fouls).toEqual([])

      value.setStoreValues({ country: 'Canada', state: 'CA', city: 'LA' })
      await Promise.resolve()

      expect(value.form.fouls).toHaveLength(1)
      expect(value.form.fouls[0].field).toBe('state')
    } finally {
      dispose()
    }
  })

  it('applyStrike calls setFieldValue', async () => {
    const engine = umpire({
      fields,
      rules: [enabledWhen('state', (v) => (v as Values).country === 'US')],
    })

    const { value, dispose } = withRoot(() => {
      const [storeValues, setStoreValues] = createSignal({
        country: 'US',
        state: 'CA',
        city: 'LA',
      })
      const setFieldValue = mock(() => {})
      const form = {
        useStore: <T,>(selector: Selector<T>) => () =>
          selector({ values: storeValues() }),
        setFieldValue,
      } satisfies SolidForm
      return {
        setStoreValues,
        setFieldValue,
        form: createUmpireForm(form, engine),
      }
    })

    try {
      await Promise.resolve()
      expect(value.form.field('country').enabled).toBe(true)
      expect(value.form.fouls).toEqual([])

      value.setStoreValues({ country: 'Canada', state: 'CA', city: 'LA' })
      await Promise.resolve()

      expect(value.form.fouls.length).toBeGreaterThan(0)
      value.form.applyStrike()
      expect(value.setFieldValue).toHaveBeenCalledWith('state', undefined)
    } finally {
      dispose()
    }
  })
})

describe('createUmpireFormComponents', () => {
  it('returns three component factories', () => {
    const engine = umpire({ fields: { a: {} }, rules: [] })
    const components = createUmpireFormComponents(engine)

    expect(components).toHaveProperty('UmpireScope')
    expect(components).toHaveProperty('UmpireField')
    expect(components).toHaveProperty('UmpireSubmit')
    expect(typeof components.UmpireScope).toBe('function')
    expect(typeof components.UmpireField).toBe('function')
    expect(typeof components.UmpireSubmit).toBe('function')
  })

  it('UmpireField does not render children when disabled', () => {
    const engine = umpire({ fields: { a: {} }, rules: [] })
    const { UmpireField } = createUmpireFormComponents(engine)

    createRoot((dispose) => {
      let childRendered = false

      const memo = UmpireFormContext.Provider({
        value: () => ({
          field: () => ({
            enabled: false,
            available: false,
            disabled: true,
            required: false,
            satisfied: false,
            fair: true,
            reason: null,
            reasons: [],
          }),
          fouls: [],
          applyStrike: () => {},
        }),
        children: () => {
          const result = UmpireField({
            name: 'a',
            children: () => {
              childRendered = true
              return undefined
            },
          })
          return result
        },
      })

      if (typeof memo === 'function') {
        memo()
      }

      expect(childRendered).toBe(false)
      dispose()
    })
  })

  it('UmpireField renders children when enabled', () => {
    const engine = umpire({ fields: { a: {} }, rules: [] })
    const { UmpireField } = createUmpireFormComponents(engine)

    createRoot((dispose) => {
      let childRendered = false

      const memo = UmpireFormContext.Provider({
        value: () => ({
          field: () => ({
            enabled: true,
            available: true,
            disabled: false,
            required: false,
            satisfied: true,
            fair: true,
            reason: null,
            reasons: [],
          }),
          fouls: [],
          applyStrike: () => {},
        }),
        children: () => {
          const result = UmpireField({
            name: 'a',
            children: () => {
              childRendered = true
              return undefined
            },
          })
          return result
        },
      })

      if (typeof memo === 'function') {
        memo()
      }

      expect(childRendered).toBe(true)
      dispose()
    })
  })
})

describe('UmpireFormSubscribe', () => {
  it('renders children with umpireForm from mock Subscribe', () => {
    const engine = umpire({ fields: { a: {} }, rules: [] })

    const { value: capturedUmpireForm, dispose } = withRoot(() => {
      let captured: UmpireFormLike | null = null

      const Subscribe: Subscribe = (opts) => {
        const valuesAccessor = () => opts.selector({ values: { a: 'test' } })
        return opts.children(valuesAccessor)
      }

      UmpireFormSubscribe({
        form: { Subscribe, setFieldValue: () => {} },
        engine,
        children: (umpireForm) => {
          captured = umpireForm
          return null
        },
      })

      return captured
    })

    try {
      expect(capturedUmpireForm).not.toBeNull()
      expect(capturedUmpireForm!.field('a').enabled).toBe(true)
      expect(capturedUmpireForm!.field('a').required).toBe(false)
    } finally {
      dispose()
    }
  })
})
