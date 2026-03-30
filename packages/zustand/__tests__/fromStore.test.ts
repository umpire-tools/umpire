import { createStore } from 'zustand/vanilla'
import { umpire, enabledWhen, requires } from '@umpire/core'
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
    // confirmPassword disabled because password is empty
    expect(us.field('confirmPassword').enabled).toBe(false)
    // inviteCode disabled because username is not satisfied
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

    // Set password to enable confirmPassword
    store.setState({ password: 'secret' })

    expect(us.field('confirmPassword').enabled).toBe(true)

    us.destroy()
  })

  it('penalties track transitions', () => {
    const store = createFormStore({
      username: 'alice',
      password: 'secret',
      confirmPassword: 'secret',
    })
    const ump = umpire({ fields, rules })
    const us = fromStore(ump, store, {
      select: (state) => state as Record<string, unknown>,
    })

    // Initially no penalties
    expect(us.penalties).toHaveLength(0)

    // confirmPassword was enabled and had a value — now clear password to disable it
    store.setState({ password: '' })

    expect(us.field('confirmPassword').enabled).toBe(false)
    // confirmPassword had 'secret' and is now disabled — should recommend reset
    expect(us.penalties.length).toBeGreaterThanOrEqual(1)
    expect(us.penalties.some((p) => p.field === 'confirmPassword')).toBe(true)

    us.destroy()
  })

  it('context selector works', () => {
    type Ctx = { requireInvite: boolean }

    const contextFields = {
      username: {},
      inviteCode: {},
    } as const

    type CFields = typeof contextFields

    const contextRules = [
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

    const ump = umpire<CFields, Ctx>({ fields: contextFields, rules: contextRules })
    const us = fromStore(ump, store, {
      select: (state) => ({
        username: state.username,
        inviteCode: state.inviteCode,
      }),
      context: (state) => ({ requireInvite: state.requireInvite }),
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

    // No calls after destroy
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

    // Each field has the expected shape
    for (const field of ['username', 'password', 'confirmPassword', 'inviteCode'] as const) {
      expect(availability[field]).toHaveProperty('enabled')
      expect(availability[field]).toHaveProperty('required')
      expect(availability[field]).toHaveProperty('reason')
      expect(availability[field]).toHaveProperty('reasons')
    }

    us.destroy()
  })
})
