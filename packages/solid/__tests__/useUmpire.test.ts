import { describe, expect, it, spyOn } from 'bun:test'
import { createRoot, createSignal } from 'solid-js'
import { enabledWhen, oneOf, requires, umpire } from '@umpire/core'
import type { FieldDef } from '@umpire/core'
import { useUmpire } from '../src/useUmpire.js'

function withRoot<T>(run: () => T) {
  let value!: T
  let dispose!: () => void

  createRoot((rootDispose) => {
    dispose = rootDispose
    value = run()
  })

  return {
    value,
    dispose,
  }
}

const fields = {
  name: { default: '' },
  email: { default: '' },
  phone: { default: '' },
} satisfies Record<string, FieldDef>

describe('useUmpire', () => {
  it('returns check with correct availability', () => {
    const ump = umpire({
      fields,
      rules: [
        enabledWhen('phone', (values) => !!values.name),
      ],
    })

    const { value, dispose } = withRoot(() => {
      const [values] = createSignal({ name: 'Alice', email: '', phone: '' })
      return useUmpire(ump, values)
    })

    try {
      expect(value.check().phone.enabled).toBe(true)
      expect(value.check().name.enabled).toBe(true)
      expect(value.check().email.enabled).toBe(true)
    } finally {
      dispose()
    }
  })

  it('recomputes check when values change', () => {
    const ump = umpire({
      fields,
      rules: [
        enabledWhen('phone', (values) => !!values.name),
      ],
    })

    const { value, dispose } = withRoot(() => {
      const [values, setValues] = createSignal({ name: '', email: '', phone: '' })
      return {
        setValues,
        ...useUmpire(ump, values),
      }
    })

    try {
      expect(value.check().phone.enabled).toBe(false)

      value.setValues({ name: 'Alice', email: '', phone: '' })

      expect(value.check().phone.enabled).toBe(true)
    } finally {
      dispose()
    }
  })

  it('returns empty fouls on first read', () => {
    const ump = umpire({
      fields,
      rules: [
        enabledWhen('phone', (values) => !!values.name),
      ],
    })

    const { value, dispose } = withRoot(() => {
      const [values] = createSignal({ name: 'Alice', email: '', phone: '555-1234' })
      return useUmpire(ump, values)
    })

    try {
      expect(value.fouls()).toEqual([])
    } finally {
      dispose()
    }
  })

  it('computes check once on mount', () => {
    const ump = umpire({
      fields,
      rules: [
        enabledWhen('phone', (values) => !!values.name),
      ],
    })
    const checkSpy = spyOn(ump, 'check')

    const { value, dispose } = withRoot(() => {
      const [values] = createSignal({ name: 'Alice', email: '', phone: '' })
      return useUmpire(ump, values)
    })

    try {
      expect(checkSpy).toHaveBeenCalledTimes(1)
      expect(value.check().phone.enabled).toBe(true)
      expect(checkSpy).toHaveBeenCalledTimes(1)
    } finally {
      dispose()
    }
  })

  it('returns fouls when a field transitions from enabled to disabled', () => {
    const ump = umpire({
      fields,
      rules: [
        enabledWhen('phone', (values) => !!values.name),
      ],
    })

    const { value, dispose } = withRoot(() => {
      const [values, setValues] = createSignal({ name: 'Alice', email: '', phone: '555-1234' })
      return {
        setValues,
        ...useUmpire(ump, values),
      }
    })

    try {
      expect(value.fouls()).toEqual([])

      value.setValues({ name: '', email: '', phone: '555-1234' })

      expect(value.fouls()).toHaveLength(1)
      expect(value.fouls()[0].field).toBe('phone')
    } finally {
      dispose()
    }
  })

  it('passes conditions to check', () => {
    type Conditions = { premium: boolean }

    const premiumFields = {
      advanced: { default: '' },
      basic: { default: '' },
    } satisfies Record<string, FieldDef>

    const ump = umpire<typeof premiumFields, Conditions>({
      fields: premiumFields,
      rules: [
        enabledWhen('advanced', (_values, conditions) => conditions.premium),
      ],
    })

    const { value, dispose } = withRoot(() => {
      const [values] = createSignal({ advanced: '', basic: '' })
      const [conditions, setConditions] = createSignal<Conditions>({ premium: false })
      return {
        setConditions,
        ...useUmpire(ump, values, conditions),
      }
    })

    try {
      expect(value.check().advanced.enabled).toBe(false)

      value.setConditions({ premium: true })

      expect(value.check().advanced.enabled).toBe(true)
    } finally {
      dispose()
    }
  })

  it('passes previous values to check for oneOf resolution', () => {
    const isEmpty = (value: unknown) => value === '' || value === undefined || value === null
    const oneOfFields = {
      date: { default: '', isEmpty },
      time: { default: '', isEmpty },
      weekday: { default: '', isEmpty },
    } satisfies Record<string, FieldDef>

    const ump = umpire({
      fields: oneOfFields,
      rules: [
        oneOf('schedule', {
          specific: ['date', 'time'],
          recurring: ['weekday'],
        }),
      ],
    })

    const { value, dispose } = withRoot(() => {
      const [values, setValues] = createSignal({ date: '', time: '', weekday: '' })
      return {
        setValues,
        ...useUmpire(ump, values),
      }
    })

    try {
      expect(value.check().date.enabled).toBe(true)
      expect(value.check().time.enabled).toBe(true)
      expect(value.check().weekday.enabled).toBe(true)

      value.setValues({ date: '2025-01-01', time: '', weekday: '' })

      expect(value.check().date.enabled).toBe(true)
      expect(value.check().time.enabled).toBe(true)
      expect(value.check().weekday.enabled).toBe(false)

      value.setValues({ date: '', time: '', weekday: 'Monday' })

      expect(value.check().weekday.enabled).toBe(true)
      expect(value.check().date.enabled).toBe(false)
      expect(value.check().time.enabled).toBe(false)
    } finally {
      dispose()
    }
  })

  it('keeps foul reads stable when nothing changes', () => {
    const ump = umpire({
      fields,
      rules: [
        enabledWhen('phone', (values) => !!values.name),
        requires('email', 'name'),
      ],
    })

    const { value, dispose } = withRoot(() => {
      const [values] = createSignal({ name: 'Alice', email: '', phone: '' })
      return useUmpire(ump, values)
    })

    try {
      const first = value.fouls()
      const second = value.fouls()

      expect(first).toBe(second)
      expect(second).toEqual([])
    } finally {
      dispose()
    }
  })
})
