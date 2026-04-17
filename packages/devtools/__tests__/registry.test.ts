import { afterEach, describe, expect, it, mock, test } from 'bun:test'
import { enabledWhen, umpire } from '@umpire/core'
import type { ReadTableInspection } from '@umpire/reads'
import {
  getRegistryVersion,
  register,
  resetRegistry,
  setFoulLogDepth,
  snapshot,
  subscribe,
  unregister,
} from '../src/registry.js'

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
    process.env.NODE_ENV = 'test'
    delete process.env.UMPIRE_INTERNAL
  })

  it('stores entries and notifies subscribers for each register', () => {
    const listener = mock()
    const unsubscribe = subscribe(listener)

    expect(getRegistryVersion()).toBe(0)

    register('demo', demoUmp, {
      gate: 'open',
      target: 'kept',
    })

    let current = snapshot().get('demo')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getRegistryVersion()).toBe(1)
    expect(current?.snapshot.values.target).toBe('kept')
    expect(current?.previous).toBeNull()
    expect(current?.foulLog).toEqual([])

    register('demo', demoUmp, {
      gate: '',
      target: 'kept',
    })

    current = snapshot().get('demo')

    expect(listener).toHaveBeenCalledTimes(2)
    expect(getRegistryVersion()).toBe(2)
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
    const listener = mock()
    subscribe(listener)

    register('demo', demoUmp, {
      gate: 'open',
      target: 'kept',
    })

    listener.mockClear()
    unregister('demo')

    expect(getRegistryVersion()).toBe(2)
    expect(snapshot().size).toBe(0)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('resets the registry version counter', () => {
    register('demo', demoUmp, {
      gate: 'open',
      target: 'kept',
    })

    expect(getRegistryVersion()).toBe(1)

    resetRegistry()

    expect(getRegistryVersion()).toBe(0)
    expect(snapshot().size).toBe(0)
  })

  it('stores precomputed read inspections from register options', () => {
    const inspection: ReadTableInspection<Record<string, unknown>, Record<string, unknown>> = {
      bridges: [],
      graph: {
        edges: [],
        nodes: ['status'],
      },
      nodes: {
        status: {
          dependsOnFields: ['gate'],
          dependsOnReads: [],
          id: 'status',
          value: 'ready',
        },
      },
      values: {
        status: 'ready',
      },
    }

    register(
      'demo',
      demoUmp,
      {
        gate: 'open',
        target: 'kept',
      },
      undefined,
      { reads: inspection },
    )

    expect(snapshot().get('demo')?.reads).toEqual(inspection)
    expect(snapshot().get('demo')?.extensions).toEqual([])
  })

  it('uses readInput overrides when resolving read tables', () => {
    const inspect = mock((input: Record<string, unknown>) => ({
      bridges: [],
      graph: {
        edges: [],
        nodes: ['status'],
      },
      nodes: {
        status: {
          dependsOnFields: ['externalGate'],
          dependsOnReads: [],
          id: 'status',
          value: String(input.externalGate),
        },
      },
      values: {
        status: String(input.externalGate),
      },
    }))

    register(
      'demo',
      demoUmp,
      {
        gate: 'open',
        target: 'kept',
      },
      undefined,
      {
        reads: { inspect } as never,
        readInput: { externalGate: 'override' },
      },
    )

    expect(inspect).toHaveBeenCalledWith({ externalGate: 'override' })
    expect(snapshot().get('demo')?.reads?.values).toEqual({ status: 'override' })
    expect(snapshot().get('demo')?.extensions).toEqual([])
  })

  it('uses form values as the default read table input', () => {
    const inspect = mock((input: Record<string, unknown>) => ({
      bridges: [],
      graph: {
        edges: [],
        nodes: ['status'],
      },
      nodes: {
        status: {
          dependsOnFields: ['gate'],
          dependsOnReads: [],
          id: 'status',
          value: String(input.gate),
        },
      },
      values: {
        status: String(input.gate),
      },
    }))

    register(
      'demo',
      demoUmp,
      {
        gate: 'open',
        target: 'kept',
      },
      undefined,
      {
        reads: { inspect } as never,
      },
    )

    expect(inspect).toHaveBeenCalledWith({
      gate: 'open',
      target: 'kept',
    })
    expect(snapshot().get('demo')?.reads?.values).toEqual({ status: 'open' })
    expect(snapshot().get('demo')?.extensions).toEqual([])
  })

  it('ignores invalid reads options that are neither inspections nor read tables', () => {
    register(
      'demo',
      demoUmp,
      {
        gate: 'open',
        target: 'kept',
      },
      undefined,
      {
        reads: { value: 'not a read table' } as never,
      },
    )

    expect(snapshot().get('demo')?.reads).toBeNull()
    expect(snapshot().get('demo')?.extensions).toEqual([])
  })

  it('skips duplicate register calls with identical references', () => {
    const listener = mock()
    subscribe(listener)

    const values = {
      gate: 'open',
      target: 'kept',
    }
    const conditions = { flow: 'signup' }

    register('demo', demoUmp, values, conditions)

    const firstVersion = getRegistryVersion()
    const firstRenderIndex = snapshot().get('demo')?.renderIndex

    register('demo', demoUmp, values, conditions)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getRegistryVersion()).toBe(firstVersion)
    expect(snapshot().get('demo')?.renderIndex).toBe(firstRenderIndex)
  })

  it('stores resolved custom extensions from register options', () => {
    const inspect = mock(() => ({
      sections: [{
        kind: 'rows' as const,
        title: 'Summary',
        rows: [
          { label: 'status', value: 'blocked' },
          { label: 'reason', value: 'gate required' },
        ],
      }],
    }))

    register(
      'demo',
      demoUmp,
      {
        gate: '',
        target: 'kept',
      },
      { flow: 'signup' },
      {
        extensions: [{
          id: 'validation',
          label: 'validation',
          inspect,
        }],
      },
    )

    expect(inspect).toHaveBeenCalledWith(expect.objectContaining({
      conditions: { flow: 'signup' },
      previous: null,
      values: {
        gate: '',
        target: 'kept',
      },
    }))
    expect(snapshot().get('demo')?.extensions).toContainEqual({
      id: 'validation',
      label: 'validation',
      view: {
        sections: [{
          kind: 'rows',
          title: 'Summary',
          rows: [
            { label: 'status', value: 'blocked' },
            { label: 'reason', value: 'gate required' },
          ],
        }],
      },
    })
  })

  it('does not register in production without the internal override', () => {
    const listener = mock()
    subscribe(listener)
    process.env.NODE_ENV = 'production'
    delete process.env.UMPIRE_INTERNAL

    register('demo', demoUmp, {
      gate: 'open',
      target: 'kept',
    })

    expect(snapshot().size).toBe(0)
    expect(getRegistryVersion()).toBe(0)
    expect(listener).not.toHaveBeenCalled()
  })

  it('allows production registration when the internal override is enabled', () => {
    process.env.NODE_ENV = 'production'
    process.env.UMPIRE_INTERNAL = 'true'

    register('demo', demoUmp, {
      gate: 'open',
      target: 'kept',
    })

    expect(snapshot().get('demo')?.snapshot.values.gate).toBe('open')
    expect(getRegistryVersion()).toBe(1)
  })

  it('does nothing when unregistering an unknown id', () => {
    const listener = mock()
    subscribe(listener)

    unregister('missing')

    expect(getRegistryVersion()).toBe(0)
    expect(listener).not.toHaveBeenCalled()
  })

  it('trims foul history using the configured depth', () => {
    setFoulLogDepth(1.9)

    register('demo', demoUmp, {
      gate: 'open',
      target: 'kept',
    })
    register('demo', demoUmp, {
      gate: '',
      target: 'kept',
    })
    register('demo', demoUmp, {
      gate: 'open',
      target: 'kept',
    })
    register('demo', demoUmp, {
      gate: '',
      target: 'kept',
    })

    expect(snapshot().get('demo')?.foulLog).toEqual([
      expect.objectContaining({
        field: 'target',
        reason: 'gate required',
        renderIndex: 4,
      }),
    ])
  })
})
