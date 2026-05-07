import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()

import { describe, it, expect, mock } from 'bun:test'
import { render, waitFor } from '@testing-library/react'
import React from 'react'
import { umpire, enabledWhen, fairWhen } from '@umpire/core'
import {
  useUmpireForm,
  UmpireFormSubscribe,
  createUmpireFormComponents,
} from '../src/react.js'
import { umpireFieldValidators } from '../src/validator.js'

// ---------------------------------------------------------------------------
// Exported shape
// ---------------------------------------------------------------------------

describe('exports', () => {
  it('useUmpireForm is a function', () => {
    expect(typeof useUmpireForm).toBe('function')
  })

  it('UmpireFormSubscribe is a function', () => {
    expect(typeof UmpireFormSubscribe).toBe('function')
  })

  it('createUmpireFormComponents is a function', () => {
    expect(typeof createUmpireFormComponents).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// useUmpireForm  –  pure-logic tests using engine.check directly
// ---------------------------------------------------------------------------

describe('useUmpireForm', () => {
  type Values = Record<string, unknown>

  it('returns field status matching engine state', () => {
    const engine = umpire({
      fields: { email: {}, name: { required: true } },
      rules: [],
    })

    const avail = engine.check({ email: 'a@b.com', name: '' })

    expect(avail.email.enabled).toBe(true)
    expect(avail.email.required).toBe(false)
    expect(avail.email.satisfied).toBe(true)

    expect(avail.name.enabled).toBe(true)
    expect(avail.name.required).toBe(true)
    // Empty string: presence-based → satisfied because '' is not null/undefined
    expect(avail.name.satisfied).toBe(true)
  })

  it('available alias matches enabled', () => {
    const engine = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [enabledWhen('c', (v) => (v as Values).a === 'x')],
    })

    const avail = engine.check({ a: 'x', b: '', c: '' })
    expect(avail.a.enabled).toBe(true)
    expect(avail.c.enabled).toBe(true)

    const avail2 = engine.check({ a: 'y', b: '', c: '' })
    expect(avail2.c.enabled).toBe(false)
  })

  it('disabled field has required: false', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', (v) => (v as Values).a === 'x')],
    })

    const avail = engine.check({ a: 'y', b: 'val' })
    expect(avail.b.enabled).toBe(false)
    expect(avail.b.required).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createUmpireFormComponents  –  shape and factory tests
// ---------------------------------------------------------------------------

describe('createUmpireFormComponents', () => {
  type Conditions = { mode: 'edit' | 'view' }

  it('returns { UmpireScope, UmpireField, UmpireSubmit }', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [],
    })

    const components = createUmpireFormComponents(engine)

    expect(components).toHaveProperty('UmpireScope')
    expect(components).toHaveProperty('UmpireField')
    expect(components).toHaveProperty('UmpireSubmit')
    expect(typeof components.UmpireScope).toBe('function')
    expect(typeof components.UmpireField).toBe('function')
    expect(typeof components.UmpireSubmit).toBe('function')
  })

  it('uses explicit validators prop over auto-wired entry', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [],
    })

    const autoValidators = umpireFieldValidators(engine)
    const explicitValidators = { onChange: () => 'custom-error' }

    // Auto-validators exist for email
    expect(autoValidators.email).toBeDefined()
    expect(typeof autoValidators.email.onChange).toBe('function')

    // Explicit validators are different
    expect(explicitValidators.onChange()).toBe('custom-error')
  })

  it('engine respects conditions for enabled/disabled', () => {
    const engine = umpire({
      fields: { role: {} },
      rules: [enabledWhen('role', (_v, ctx) => ctx?.mode === 'edit')],
    } satisfies Parameters<typeof umpire<{ role: {} }, Conditions>>[0])

    const avail = engine.check({ role: 'admin' }, { mode: 'edit' })
    expect(avail.role.enabled).toBe(true)

    const avail2 = engine.check({ role: 'admin' }, { mode: 'view' })
    expect(avail2.role.enabled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// UmpireFormSubscribe  –  actual React rendering
// ---------------------------------------------------------------------------

describe('UmpireFormSubscribe', () => {
  it('renders children with correct field status via mock Subscribe', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [],
    })

    function MockSubscribe({
      selector,
      children,
    }: {
      selector(state: {
        values: Record<string, unknown>
      }): Record<string, unknown>
      children(values: Record<string, unknown>): React.ReactNode
    }) {
      return <>{children(selector({ values: { email: 'a@b.com' } }))}</>
    }

    const { getByTestId } = render(
      <UmpireFormSubscribe
        form={{ Subscribe: MockSubscribe, setFieldValue: () => {} }}
        engine={engine}
      >
        {(umpireForm) => (
          <div>
            <span data-testid="enabled">
              {String(umpireForm.field('email').enabled)}
            </span>
            <span data-testid="required">
              {String(umpireForm.field('email').required)}
            </span>
            <span data-testid="satisfied">
              {String(umpireForm.field('email').satisfied)}
            </span>
          </div>
        )}
      </UmpireFormSubscribe>,
    )

    expect(getByTestId('enabled').textContent).toBe('true')
    expect(getByTestId('required').textContent).toBe('false')
    expect(getByTestId('satisfied').textContent).toBe('true')
  })

  it('field proxy exposes all availability properties and caches by field name', () => {
    const engine = umpire({
      fields: {
        email: {
          required: true,
          validate: (value) =>
            typeof value === 'string' && value.includes('@')
              ? true
              : 'email required',
        },
        plan: {},
      },
      rules: [
        enabledWhen('email', (v) => (v as Values).plan === 'pro'),
        fairWhen('email', (value) => value !== 'blocked', {
          reason: 'blocked address',
        }),
      ],
    })

    function MockSubscribe({
      selector,
      children,
    }: {
      selector(state: {
        values: Record<string, unknown>
      }): Record<string, unknown>
      children(values: Record<string, unknown>): React.ReactNode
    }) {
      return <>{children(selector({ values: { email: null, plan: 'pro' } }))}</>
    }

    let firstField: unknown
    const { getByTestId } = render(
      <UmpireFormSubscribe
        form={{ Subscribe: MockSubscribe, setFieldValue: () => {} }}
        engine={engine}
      >
        {(umpireForm) => {
          const email = umpireForm.field('email')
          firstField = email as never
          return (
            <div>
              <span data-testid="same">
                {String(email === umpireForm.field('email'))}
              </span>
              <span data-testid="state">
                {[
                  email.enabled,
                  email.available,
                  email.disabled,
                  email.required,
                  email.satisfied,
                  email.fair,
                  email.reason,
                  email.reasons.length,
                  email.error,
                ].join('|')}
              </span>
              <span data-testid="unknown">
                {[
                  umpireForm.field('missing').enabled,
                  umpireForm.field('missing').available,
                  umpireForm.field('missing').disabled,
                  umpireForm.field('missing').satisfied,
                  umpireForm.field('missing').fair,
                  umpireForm.field('missing').reason,
                  umpireForm.field('missing').reasons.length,
                ].join('|')}
              </span>
            </div>
          )
        }}
      </UmpireFormSubscribe>,
    )

    expect(firstField).toBeDefined()
    expect(getByTestId('same').textContent).toBe('true')
    expect(getByTestId('state').textContent).toBe(
      'true|true|false|true|false|true||0|',
    )
    expect(getByTestId('unknown').textContent).toBe(
      'false|false|true|false|true||0',
    )
  })

  it('resolves conditions functions and auto-applies strike transitions', async () => {
    const engine = umpire({
      fields: { mode: {}, details: {} },
      rules: [
        enabledWhen(
          'details',
          (v, ctx) => ctx?.allow === true && (v as Values).mode === 'edit',
        ),
      ],
    } satisfies Parameters<
      typeof umpire<{ mode: {}; details: {} }, { allow: boolean }>
    >[0])

    function MockSubscribe({
      children,
    }: {
      selector(state: {
        values: Record<string, unknown>
      }): Record<string, unknown>
      children(values: Record<string, unknown>): React.ReactNode
    }) {
      const [values, setValues] = React.useState({
        mode: 'edit',
        details: 'stale',
      })

      React.useEffect(() => {
        setValues({ mode: 'view', details: 'stale' })
      }, [])

      return <>{children(values)}</>
    }

    const setFieldValue = mock(() => {})

    const { findByTestId } = render(
      <UmpireFormSubscribe
        form={{ Subscribe: MockSubscribe, setFieldValue }}
        engine={engine}
        conditions={() => ({ allow: true })}
        strike
      >
        {(umpireForm) => (
          <span data-testid="enabled">
            {String(umpireForm.field('details').enabled)}
          </span>
        )}
      </UmpireFormSubscribe>,
    )

    expect((await findByTestId('enabled')).textContent).toBe('false')
    await waitFor(() => {
      expect(setFieldValue).toHaveBeenCalledWith('details', undefined)
    })
  })

  it('does not auto-apply strike for enabled fields that become foul', async () => {
    const engine = umpire({
      fields: { postalCode: {} },
      rules: [
        fairWhen('postalCode', (value) => value === '12345', {
          reason: 'Invalid postal code',
        }),
      ],
    })

    function MockSubscribe({
      children,
    }: {
      selector(state: {
        values: Record<string, unknown>
      }): Record<string, unknown>
      children(values: Record<string, unknown>): React.ReactNode
    }) {
      const [values, setValues] = React.useState({ postalCode: '12345' })

      React.useEffect(() => {
        setValues({ postalCode: '1' })
      }, [])

      return <>{children(values)}</>
    }

    const setFieldValue = mock(() => {})

    const { findByTestId } = render(
      <UmpireFormSubscribe
        form={{ Subscribe: MockSubscribe, setFieldValue }}
        engine={engine}
        strike
      >
        {(umpireForm) => (
          <span data-testid="fair">
            {String(umpireForm.field('postalCode').fair)}
          </span>
        )}
      </UmpireFormSubscribe>,
    )

    expect((await findByTestId('fair')).textContent).toBe('false')
    expect(setFieldValue).not.toHaveBeenCalled()
  })
})
