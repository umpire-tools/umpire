import { describe, expect, it } from 'bun:test'
import { enabledWhen, umpire } from '@umpire/core'
import { reactiveUmp } from '@umpire/signals'
import { preactAdapter } from '@umpire/signals/preact'
import { fromStore } from '@umpire/store'

function writableSignal<T>(initial: T) {
  const signal = preactAdapter.signal(initial)

  return {
    get: signal.get,
    set: signal.set,
  }
}

function createStore<S>(initialState: S) {
  let state = initialState
  const listeners = new Set<(next: S, prev: S) => void>()

  return {
    getState() {
      return state
    },
    subscribe(listener: (next: S, prev: S) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setState(next: S) {
      const prev = state
      state = next
      for (const listener of listeners) {
        listener(state, prev)
      }
    },
  }
}

describe('signals + store integration', () => {
  it('supports store-driven updates while preserving signal-backed field reads', () => {
    const ump = umpire({
      fields: {
        password: { default: '' },
        confirmPassword: { default: '' },
      },
      rules: [
        enabledWhen('confirmPassword', (values) => Boolean(values.password), {
          reason: 'Enter a password first',
        }),
      ],
    })

    const password = writableSignal('')
    const confirmPassword = writableSignal('')

    const reactive = reactiveUmp(ump, preactAdapter, {
      signals: { password, confirmPassword },
    })

    const store = createStore({ password: '', confirmPassword: '' })
    const umpStore = fromStore(ump, store, {
      select: (state) => state,
    })

    const unsubscribe = store.subscribe((next) => {
      reactive.update(next)
    })

    expect(reactive.field('confirmPassword').enabled).toBe(false)

    store.setState({ password: 'hunter22', confirmPassword: '' })

    expect(umpStore.field('confirmPassword').enabled).toBe(true)
    expect(reactive.field('confirmPassword').enabled).toBe(true)
    expect(reactive.values.password).toBe('hunter22')

    store.setState({ password: '', confirmPassword: 'stale' })

    expect(umpStore.field('confirmPassword').enabled).toBe(false)
    expect(reactive.field('confirmPassword').enabled).toBe(false)
    const beforeTeardownValues = reactive.values

    unsubscribe()
    umpStore.destroy()
    reactive.dispose()

    store.setState({ password: 'post-teardown', confirmPassword: '' })

    expect(reactive.values).toEqual(beforeTeardownValues)
    expect(reactive.field('confirmPassword').enabled).toBe(false)
  })
})
