import { jest } from '@jest/globals'
import { enabledWhen, umpire } from '@umpire/core'
import { register, resetRegistry, snapshot, subscribe, unregister } from '../src/registry.js'

const demoUmp = umpire({
  fields: {
    gate: { default: '' },
    target: { default: '' },
  },
  rules: [
    enabledWhen('target', (values) => Boolean(values.gate), {
      reason: 'gate required',
    }),
  ],
})

describe('registry', () => {
  afterEach(() => {
    resetRegistry()
  })

  it('stores entries and notifies subscribers for each register', () => {
    const listener = jest.fn()
    const unsubscribe = subscribe(listener)

    register('demo', demoUmp, {
      gate: 'open',
      target: 'kept',
    })

    let current = snapshot().get('demo')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(current?.snapshot.values.target).toBe('kept')
    expect(current?.previous).toBeNull()
    expect(current?.foulLog).toEqual([])

    register('demo', demoUmp, {
      gate: '',
      target: 'kept',
    })

    current = snapshot().get('demo')

    expect(listener).toHaveBeenCalledTimes(2)
    expect(current?.previous?.values.gate).toBe('open')
    expect(current?.scorecard.transition.fouledFields).toEqual(['target'])
    expect(current?.foulLog).toHaveLength(1)
    expect(typeof current?.foulLog[0]?.cascaded).toBe('boolean')

    unsubscribe()
    register('demo', demoUmp, {
      gate: 'open',
      target: 'kept',
    })

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('removes entries when unregistered', () => {
    const listener = jest.fn()
    subscribe(listener)

    register('demo', demoUmp, {
      gate: 'open',
      target: 'kept',
    })

    listener.mockClear()
    unregister('demo')

    expect(snapshot().size).toBe(0)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
