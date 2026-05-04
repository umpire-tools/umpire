import { describe, it, expect, mock } from 'bun:test'
import { createRoot, createSignal } from 'solid-js'
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

describe('createUmpireForm', () => {
  it('returns field status from engine', () => {
    const engine = umpire({
      fields,
      rules: [
        enabledWhen('state', (v: any) => v.country === 'US'),
        requires('city', 'state'),
      ],
    })

    const { value: umpireForm, dispose } = withRoot(() => {
      const form = {
        useStore: (selector: Function) => () =>
          selector({
            values: { country: 'Canada', state: 'ON', city: 'Toronto' },
          }),
        setFieldValue: () => {},
      }
      return createUmpireForm(form as any, engine)
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
      rules: [enabledWhen('state', (v: any) => v.country === 'US')],
    })

    const { value: umpireForm, dispose } = withRoot(() => {
      const form = {
        useStore: (selector: Function) => () =>
          selector({ values: { country: 'US', state: 'CA', city: 'LA' } }),
        setFieldValue: () => {},
      }
      return createUmpireForm(form as any, engine)
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

  it('fouls returns fouls array on transition', () => {
    const engine = umpire({
      fields,
      rules: [enabledWhen('state', (v: any) => v.country === 'US')],
    })

    const { value, dispose } = withRoot(() => {
      const [storeValues, setStoreValues] = createSignal({
        country: 'US',
        state: 'CA',
        city: 'LA',
      })
      const form = {
        useStore: (selector: Function) => () =>
          selector({ values: storeValues() }),
        setFieldValue: () => {},
      }
      return {
        setStoreValues,
        form: createUmpireForm(form as any, engine),
      }
    })

    try {
      expect(value.form.fouls).toEqual([])

      value.setStoreValues({ country: 'Canada', state: 'CA', city: 'LA' })

      expect(value.form.fouls).toHaveLength(1)
      expect(value.form.fouls[0].field).toBe('state')
    } finally {
      dispose()
    }
  })

  it('applyStrike calls setFieldValue', () => {
    const engine = umpire({
      fields,
      rules: [enabledWhen('state', (v: any) => v.country === 'US')],
    })

    const { value, dispose } = withRoot(() => {
      const [storeValues, setStoreValues] = createSignal({
        country: 'US',
        state: 'CA',
        city: 'LA',
      })
      const setFieldValue = mock(() => {})
      const form = {
        useStore: (selector: Function) => () =>
          selector({ values: storeValues() }),
        setFieldValue,
      }
      return {
        setStoreValues,
        setFieldValue,
        form: createUmpireForm(form as any, engine),
      }
    })

    try {
      value.form.fouls

      value.setStoreValues({ country: 'Canada', state: 'CA', city: 'LA' })

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

      const memo = (UmpireFormContext.Provider as any)({
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
          const result = (UmpireField as any)({
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

      const memo = (UmpireFormContext.Provider as any)({
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
          const result = (UmpireField as any)({
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
      let captured: any = null

      const Subscribe = (opts: { selector: Function; children: Function }) => {
        const valuesAccessor = () => opts.selector({ values: { a: 'test' } })
        return opts.children(valuesAccessor)
      }

      UmpireFormSubscribe({
        form: { Subscribe, setFieldValue: () => {} } as any,
        engine,
        children: (umpireForm: any) => {
          captured = umpireForm
          return null
        },
      } as any)

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
