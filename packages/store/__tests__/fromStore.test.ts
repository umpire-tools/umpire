import { createStore } from 'zustand/vanilla'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { fromStore } from '../src/fromStore.js'

const fields = {
  username: { isEmpty: (v: unknown) => v === '' || v === undefined || v === null },
  password: {},
  confirmPassword: { default: '' },
  inviteCode: { default: '' },
} as const

type Fields = typeof fields

const rules = [
  enabledWhen<Fields>('confirmPassword', (values) => {
    return (values.password as string)?.length > 0
  }),
  requires<Fields>('inviteCode', 'username'),
]

function createFormStore(initial: Record<string, unknown> = {}) {
  return createStore<Record<string, unknown>>(() => ({
    username: '',
    password: '',
    confirmPassword: '',
    inviteCode: '',
    ...initial,
  }))
}

describe('fromStore', () => {
  it('returns correct initial availability', () => {
    const store = createFormStore()
    const ump = umpire({ fields, rules })
    const us = fromStore(ump, store, {
      select: (state) => state as Record<string, unknown>,
    })

    expect(us.field('username').enabled).toBe(true)
    expect(us.field('password').enabled).toBe(true)
    expect(us.field('confirmPassword').enabled).toBe(false)
    expect(us.field('inviteCode').enabled).toBe(false)

    us.destroy()
  })

  it('updates availability when store changes', () => {
    const store = createFormStore()
    const ump = umpire({ fields, rules })
    const us = fromStore(ump, store, {
      select: (state) => state as Record<string, unknown>,
    })

    expect(us.field('confirmPassword').enabled).toBe(false)

    store.setState({ password: 'secret' })

    expect(us.field('confirmPassword').enabled).toBe(true)

    us.destroy()
  })

  it('fouls track transitions', () => {
    const store = createFormStore({
      username: 'alice',
      password: 'secret',
      confirmPassword: 'secret',
    })
    const ump = umpire({ fields, rules })
    const us = fromStore(ump, store, {
      select: (state) => state as Record<string, unknown>,
    })

    expect(us.fouls).toHaveLength(0)

    store.setState({ password: '' })

    expect(us.field('confirmPassword').enabled).toBe(false)
    expect(us.fouls.length).toBeGreaterThanOrEqual(1)
    expect(us.fouls.some((foul) => foul.field === 'confirmPassword')).toBe(true)

    us.destroy()
  })

  it('conditions selector works', () => {
    type Ctx = { requireInvite: boolean }

    const conditionsFields = {
      username: {},
      inviteCode: {},
    } as const

    type CFields = typeof conditionsFields

    const conditionsRules = [
      enabledWhen<CFields, Ctx>('inviteCode', (_values, ctx) => {
        return ctx.requireInvite
      }),
    ]

    const store = createStore<{ username: string; inviteCode: string; requireInvite: boolean }>(
      () => ({
        username: '',
        inviteCode: '',
        requireInvite: false,
      }),
    )

    const ump = umpire<CFields, Ctx>({ fields: conditionsFields, rules: conditionsRules })
    const us = fromStore(ump, store, {
      select: (state) => ({
        username: state.username,
        inviteCode: state.inviteCode,
      }),
      conditions: (state) => ({ requireInvite: state.requireInvite }),
    })

    expect(us.field('inviteCode').enabled).toBe(false)

    store.setState({ requireInvite: true })

    expect(us.field('inviteCode').enabled).toBe(true)

    us.destroy()
  })

  it('subscribe notifies on availability changes', () => {
    const store = createFormStore()
    const ump = umpire({ fields, rules })
    const us = fromStore(ump, store, {
      select: (state) => state as Record<string, unknown>,
    })

    const calls: unknown[] = []
    us.subscribe((availability) => {
      calls.push(availability)
    })

    store.setState({ password: 'secret' })

    expect(calls).toHaveLength(1)
    expect((calls[0] as Record<string, { enabled: boolean }>).confirmPassword.enabled).toBe(true)

    us.destroy()
  })

  it('destroy stops subscription', () => {
    const store = createFormStore()
    const ump = umpire({ fields, rules })
    const us = fromStore(ump, store, {
      select: (state) => state as Record<string, unknown>,
    })

    const calls: unknown[] = []
    us.subscribe((availability) => {
      calls.push(availability)
    })

    us.destroy()
    store.setState({ password: 'secret' })

    expect(calls).toHaveLength(0)
  })

  it('getAvailability returns full map', () => {
    const store = createFormStore({ username: 'alice', password: 'secret' })
    const ump = umpire({ fields, rules })
    const us = fromStore(ump, store, {
      select: (state) => state as Record<string, unknown>,
    })

    const availability = us.getAvailability()

    expect(availability).toHaveProperty('username')
    expect(availability).toHaveProperty('password')
    expect(availability).toHaveProperty('confirmPassword')
    expect(availability).toHaveProperty('inviteCode')

    for (const field of ['username', 'password', 'confirmPassword', 'inviteCode'] as const) {
      expect(availability[field]).toHaveProperty('enabled')
      expect(availability[field]).toHaveProperty('required')
      expect(availability[field]).toHaveProperty('reason')
      expect(availability[field]).toHaveProperty('reasons')
    }

    us.destroy()
  })
})
