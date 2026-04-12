import { createRoot, createSignal } from 'solid-js'
import { enabledWhen, umpire } from '@umpire/core'
import type { FieldDef } from '@umpire/core'
import { fromSolidStore } from '../src/fromSolidStore.js'

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
  name: { default: '' },
  email: { default: '' },
  phone: { default: '' },
} satisfies Record<string, FieldDef>

describe('fromSolidStore', () => {
  it('derives field availability from shared reactive values', () => {
    const ump = umpire({
      fields,
      rules: [
        enabledWhen('phone', (values) => !!values.name),
      ],
    })

    const { value, dispose } = withRoot(() => {
      const [name, setName] = createSignal('Alice')
      const [email, setEmail] = createSignal('')
      const [phone, setPhone] = createSignal('555-1234')

      const values = {
        get name() {
          return name()
        },
        get email() {
          return email()
        },
        get phone() {
          return phone()
        },
      }

      const set = (field: keyof typeof fields & string, next: unknown) => {
        switch (field) {
          case 'name':
            setName(String(next))
            return
          case 'email':
            setEmail(String(next))
            return
          case 'phone':
            setPhone(String(next))
            return
        }
      }

      return {
        setName,
        form: fromSolidStore(ump, { values, set }),
      }
    })

    try {
      expect(value.form.field('phone').enabled).toBe(true)

      value.setName('')

      expect(value.form.field('phone').enabled).toBe(false)
      expect(value.form.fouls).toHaveLength(1)
      expect(value.form.fouls[0].field).toBe('phone')
      expect(value.form.foul('phone')?.field).toBe('phone')
    } finally {
      value.form.dispose()
      dispose()
    }
  })

  it('writes back through set() and update()', () => {
    const ump = umpire({
      fields,
      rules: [
        enabledWhen('phone', (values) => !!values.name),
      ],
    })

    const { value, dispose } = withRoot(() => {
      const [name, setName] = createSignal('Alice')
      const [email, setEmail] = createSignal('')
      const [phone, setPhone] = createSignal('')

      const values = {
        get name() {
          return name()
        },
        get email() {
          return email()
        },
        get phone() {
          return phone()
        },
      }

      const set = (field: keyof typeof fields & string, next: unknown) => {
        switch (field) {
          case 'name':
            setName(String(next))
            return
          case 'email':
            setEmail(String(next))
            return
          case 'phone':
            setPhone(String(next))
            return
        }
      }

      return {
        name,
        email,
        phone,
        form: fromSolidStore(ump, { values, set }),
      }
    })

    try {
      value.form.set('name', 'Bob')
      value.form.update({ email: 'bob@example.com', phone: '555-0000' })

      expect(value.name()).toBe('Bob')
      expect(value.email()).toBe('bob@example.com')
      expect(value.phone()).toBe('555-0000')
      expect(value.form.values.name).toBe('Bob')
      expect(value.form.values.email).toBe('bob@example.com')
    } finally {
      value.form.dispose()
      dispose()
    }
  })

  it('supports fine-grained condition accessors', () => {
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
      const [advanced, setAdvanced] = createSignal('')
      const [basic, setBasic] = createSignal('')
      const [premium, setPremium] = createSignal(false)

      const values = {
        get advanced() {
          return advanced()
        },
        get basic() {
          return basic()
        },
      }

      const set = (field: keyof typeof premiumFields & string, next: unknown) => {
        switch (field) {
          case 'advanced':
            setAdvanced(String(next))
            return
          case 'basic':
            setBasic(String(next))
            return
        }
      }

      return {
        setPremium,
        form: fromSolidStore(ump, {
          values,
          set,
          conditions: {
            premium,
          },
        }),
      }
    })

    try {
      expect(value.form.field('advanced').enabled).toBe(false)

      value.setPremium(true)

      expect(value.form.field('advanced').enabled).toBe(true)
    } finally {
      value.form.dispose()
      dispose()
    }
  })
})
