import { legacy_createStore } from 'redux'
import { configureStore, createSlice } from '@reduxjs/toolkit'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { fromReduxStore } from '../src/index.js'

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

type Action = {
  type: 'patch'
  payload: Partial<FormState>
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

function reducer(state: FormState = defaultState, action: Action): FormState {
  if (action.type === 'patch') {
    return { ...state, ...action.payload }
  }

  return state
}

function createFormStore(initial: Partial<FormState> = {}) {
  return legacy_createStore(reducer, { ...defaultState, ...initial })
}

describe('fromReduxStore', () => {
  it('returns correct initial availability', () => {
    const store = createFormStore()
    const ump = umpire({ fields, rules })
    const us = fromReduxStore(ump, store, {
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

  it('updates availability and fouls from Redux transitions', () => {
    const store = createFormStore({
      username: 'alice',
      password: 'secret',
      confirmPassword: 'secret',
    })
    const ump = umpire({ fields, rules })
    const us = fromReduxStore(ump, store, {
      select: (state) => ({
        username: state.username,
        password: state.password,
        confirmPassword: state.confirmPassword,
        inviteCode: state.inviteCode,
      }),
    })

    store.dispatch({ type: 'patch', payload: { password: '' } })

    expect(us.field('confirmPassword').enabled).toBe(false)
    expect(us.fouls.some((foul) => foul.field === 'confirmPassword')).toBe(true)

    us.destroy()
  })

  it('works with Redux Toolkit configureStore and createSlice reducers', () => {
    const formSlice = createSlice({
      name: 'form',
      initialState: defaultState,
      reducers: {
        patch(state, action: { payload: Partial<FormState> }) {
          return { ...state, ...action.payload }
        },
      },
    })

    const store = configureStore({
      reducer: formSlice.reducer,
      preloadedState: {
        ...defaultState,
        username: 'alice',
        password: 'secret',
        confirmPassword: 'secret',
      },
    })
    const ump = umpire({ fields, rules })
    const us = fromReduxStore(ump, store, {
      select: (state) => ({
        username: state.username,
        password: state.password,
        confirmPassword: state.confirmPassword,
        inviteCode: state.inviteCode,
      }),
    })

    expect(us.field('confirmPassword').enabled).toBe(true)

    store.dispatch(formSlice.actions.patch({ password: '' }))

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
    const us = fromReduxStore(ump, store, {
      select: (state) => ({
        username: state.username,
        inviteCode: state.inviteCode,
      }),
      conditions: (state) => ({ requireInvite: state.requireInvite }),
    })

    expect(us.field('inviteCode').enabled).toBe(false)

    store.dispatch({ type: 'patch', payload: { requireInvite: true } })

    expect(us.field('inviteCode').enabled).toBe(true)

    us.destroy()
  })

  it('subscribe notifies listeners and destroy unsubscribes', () => {
    const store = createFormStore()
    const ump = umpire({ fields, rules })
    const us = fromReduxStore(ump, store, {
      select: (state) => ({
        username: state.username,
        password: state.password,
        confirmPassword: state.confirmPassword,
        inviteCode: state.inviteCode,
      }),
    })

    const calls: unknown[] = []
    us.subscribe((availability) => {
      calls.push(availability)
    })

    store.dispatch({ type: 'patch', payload: { password: 'secret' } })
    expect(calls).toHaveLength(1)

    us.destroy()
    store.dispatch({ type: 'patch', payload: { password: '' } })
    expect(calls).toHaveLength(1)
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

    type NestedAction = {
      type: 'disableNote'
    }

    function nestedReducer(
      state: NestedState = {
        settings: { allowNote: true },
        note: 'keep me',
      },
      action: NestedAction,
    ): NestedState {
      if (action.type === 'disableNote') {
        state.settings.allowNote = false

        return {
          ...state,
          settings: state.settings,
        }
      }

      return state
    }

    const store = legacy_createStore(nestedReducer)
    const ump = umpire({
      fields: nestedFields,
      rules: [
        enabledWhen('note', (values) => {
          return (values.settings as { allowNote: boolean } | undefined)?.allowNote === true
        }),
      ],
    })
    const us = fromReduxStore(ump, store, {
      select: (state) => ({
        settings: state.settings,
        note: state.note,
      }),
    })

    store.dispatch({ type: 'disableNote' })

    expect(us.field('note').enabled).toBe(false)
    expect(us.fouls.some((foul) => foul.field === 'note')).toBe(true)

    us.destroy()
  })
})
