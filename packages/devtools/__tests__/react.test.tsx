import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { enabledWhen, umpire } from '@umpire/core'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import * as registry from '../src/registry.js'
import { useUmpireWithDevtools } from '../entrypoints/react.js'

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

describe('react hooks', () => {
  let container: HTMLDivElement | undefined
  let root: Root | undefined

  afterEach(() => {
    act(() => {
      root?.unmount()
    })

    container?.remove()
    registry.resetRegistry()
    mock.restore()
  })

  function mount(component: ReactElement) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    act(() => {
      root!.render(component)
    })
  }

  it('registers synchronously during render and unregisters on unmount', () => {
    const registerSpy = spyOn(registry, 'register')
    const unregisterSpy = spyOn(registry, 'unregister')

    function Harness() {
      useUmpireWithDevtools('demo', demoUmp, {
        gate: 'open',
        target: 'kept',
      })

      return null
    }

    mount(createElement(Harness))

    expect(registerSpy).toHaveBeenCalledTimes(1)
    expect(unregisterSpy).not.toHaveBeenCalled()

    act(() => {
      root.unmount()
    })
    root = undefined

    expect(unregisterSpy).toHaveBeenCalledTimes(1)
  })

  it('computes fouls from the previous render snapshot', () => {
    const registerSpy = spyOn(registry, 'register')

    const renders: Array<{ fouls: string[] }> = []

    function Harness({ gate }: { gate: string }) {
      const { fouls } = useUmpireWithDevtools('demo', demoUmp, {
        gate,
        target: 'kept',
      })

      renders.push({ fouls: fouls.map((foul) => foul.field) })

      return null
    }

    mount(createElement(Harness, { gate: 'open' }))

    expect(registerSpy).toHaveBeenCalledTimes(1)
    expect(renders).toEqual([{ fouls: [] }])

    act(() => {
      root!.render(createElement(Harness, { gate: '' }))
    })

    expect(registerSpy).toHaveBeenCalledTimes(2)
    expect(renders).toEqual([
      { fouls: [] },
      { fouls: ['target'] },
    ])
    expect(registry.snapshot().get('demo')?.previous?.values.gate).toBe('open')
  })
})
