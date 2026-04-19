import { createStore } from 'zustand/vanilla'
import { enabledWhen, umpire } from '@umpire/core'
import { fromStore } from '../src/index.js'

const fields = {
  username: {},
  password: {},
  confirmPassword: { default: '' },
} as const

type Fields = typeof fields

const rules = [
  enabledWhen<Fields>('confirmPassword', (values) => {
    return (values.password as string)?.length > 0
  }),
]

function createFormStore(initial: Record<string, unknown> = {}) {
  return createStore<Record<string, unknown>>(() => ({
    username: '',
    password: '',
    confirmPassword: 'secret',
    ...initial,
  }))
}

describe('@umpire/zustand', () => {
  it('integrates with a vanilla Zustand store end to end', () => {
    const store = createFormStore()
    const ump = umpire({ fields, rules })
    const availability = fromStore(ump, store, {
      select: (state) => state as Record<string, unknown>,
    })

    expect(availability.field('confirmPassword').enabled).toBe(false)

    store.setState({ password: 'secret' })

    expect(availability.field('confirmPassword').enabled).toBe(true)

    store.setState({ password: '', confirmPassword: 'secret' })

    expect(availability.field('confirmPassword').enabled).toBe(false)
    expect(availability.fouls.some((foul) => foul.field === 'confirmPassword')).toBe(true)

    availability.destroy()
  })
})
