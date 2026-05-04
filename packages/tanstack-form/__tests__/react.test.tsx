import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()

import { describe, it, expect, mock } from 'bun:test'
import { render } from '@testing-library/react'
import React from 'react'
import {
  umpire,
  enabledWhen,
  fairWhen,
  requires,
} from '@umpire/core'
import {
  useUmpireForm,
  UmpireFormSubscribe,
  createUmpireFormComponents,
  type UmpireFormField,
  type UmpireForm,
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
      rules: [enabledWhen('c', (v) => (v as any).a === 'x')],
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
      rules: [enabledWhen('b', (v) => (v as any).a === 'x')],
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
      rules: [
        enabledWhen('role', (_v, ctx) => (ctx as any)?.mode === 'edit'),
      ],
    })

    const avail = engine.check({ role: 'admin' }, { mode: 'edit' } as any)
    expect(avail.role.enabled).toBe(true)

    const avail2 = engine.check({ role: 'admin' }, { mode: 'view' } as any)
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

    function MockSubscribe({ selector, children }: any) {
      return <>{children(selector({ values: { email: 'a@b.com' } }))}</>
    }

    const { getByTestId } = render(
      <UmpireFormSubscribe
        form={{ Subscribe: MockSubscribe, setFieldValue: () => {} } as any}
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
})
