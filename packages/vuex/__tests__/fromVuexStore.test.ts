import { createStore } from 'vuex'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { fromVuexStore } from '../src/index.js'

const fields = {
  username: { isEmpty: (v: unknown) => v === '' || v === undefined || v === null },
  password: {},
  confirmPassword: { default: '' },
  inviteCode: { default: '' },
} as const

type Fields = typeof fields

type FormState = {
  username: string
  password: string
  confirmPassword: string
  inviteCode: string
  requireInvite: boolean
}

const rules = [
  enabledWhen<Fields>('confirmPassword', (values) => {
    return (values.password as string)?.length > 0
  }),
  requires<Fields>('inviteCode', 'username'),
]

const defaultState: FormState = {
  username: '',
  password: '',
  confirmPassword: '',
  inviteCode: '',
  requireInvite: false,
}

function createFormStore(initial: Partial<FormState> = {}) {
  return createStore<FormState>({
    state: {
      ...defaultState,
      ...initial,
    },
    mutations: {
      patch(state, payload: Partial<FormState>) {
        Object.assign(state, payload)
      },
    },
  })
}

describe('fromVuexStore', () => {
  it('returns correct initial availability', () => {
    const store = createFormStore()
    const ump = umpire({ fields, rules })
    const us = fromVuexStore(ump, store, {
      select: (state) => ({
        username: state.username,
        password: state.password,
        confirmPassword: state.confirmPassword,
        inviteCode: state.inviteCode,
      }),
    })

    expect(us.field('confirmPassword').enabled).toBe(false)
    expect(us.field('inviteCode').enabled).toBe(false)

    us.destroy()
  })

  it('updates availability and fouls from Vuex transitions', () => {
    const store = createFormStore({
      username: 'alice',
      password: 'secret',
      confirmPassword: 'secret',
    })
    const ump = umpire({ fields, rules })
    const us = fromVuexStore(ump, store, {
      select: (state) => ({
        username: state.username,
        password: state.password,
        confirmPassword: state.confirmPassword,
        inviteCode: state.inviteCode,
      }),
    })

    store.commit('patch', { password: '' })

    expect(us.field('confirmPassword').enabled).toBe(false)
    expect(us.fouls.some((foul) => foul.field === 'confirmPassword')).toBe(true)

    us.destroy()
  })

  it('supports conditions selectors', () => {
    type Conditions = { requireInvite: boolean }

    const conditionFields = {
      username: {},
      inviteCode: {},
    } as const

    type ConditionFields = typeof conditionFields

    const conditionRules = [
      enabledWhen<ConditionFields, Conditions>('inviteCode', (_values, conditions) => {
        return conditions.requireInvite
      }),
    ]

    const store = createFormStore()
    const ump = umpire<ConditionFields, Conditions>({
      fields: conditionFields,
      rules: conditionRules,
    })
    const us = fromVuexStore(ump, store, {
      select: (state) => ({
        username: state.username,
        inviteCode: state.inviteCode,
      }),
      conditions: (state) => ({ requireInvite: state.requireInvite }),
    })

    expect(us.field('inviteCode').enabled).toBe(false)

    store.commit('patch', { requireInvite: true })

    expect(us.field('inviteCode').enabled).toBe(true)

    us.destroy()
  })

  it('snapshots nested selected objects before in-place mutations', () => {
    const nestedFields = {
      settings: {},
      note: { default: '' },
    } as const

    type NestedState = {
      settings: { allowNote: boolean }
      note: string
    }

    const store = createStore<NestedState>({
      state: {
        settings: { allowNote: true },
        note: 'keep me',
      },
      mutations: {
        disableNote(state) {
          state.settings.allowNote = false
        },
      },
    })
    const ump = umpire({
      fields: nestedFields,
      rules: [
        enabledWhen('note', (values) => {
          return (values.settings as { allowNote: boolean } | undefined)?.allowNote === true
        }),
      ],
    })
    const us = fromVuexStore(ump, store, {
      select: (state) => ({
        settings: state.settings,
        note: state.note,
      }),
    })

    store.commit('disableNote')

    expect(us.field('note').enabled).toBe(false)
    expect(us.fouls.some((foul) => foul.field === 'note')).toBe(true)

    us.destroy()
  })
})
