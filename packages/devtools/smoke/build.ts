import { afterEach, describe, expect, test } from 'bun:test'
import { umpire } from '@umpire/core'
import * as indexBundle from '../dist/index.js'
import * as reactBundle from '../dist/react.js'
import * as slimBundle from '../dist/slim.js'

const smokeId = 'smoke'

const demoUmp = umpire({
  fields: {
    email: { default: '' },
  },
  rules: [],
})

afterEach(() => {
  indexBundle.unmount()
  indexBundle.unregister(smokeId)
  slimBundle.unregister(smokeId)
  document.body.innerHTML = ''
})

describe('devtools dist smoke', () => {
  test('slim bundle can register and mount built devtools state', () => {
    slimBundle.register(smokeId, demoUmp, { email: 'alex@example.com' })

    expect(slimBundle.snapshot().get(smokeId)?.snapshot.values.email).toBe('alex@example.com')

    const cleanup = slimBundle.mount()

    expect(document.getElementById('umpire-devtools')).not.toBeNull()

    cleanup()

    expect(document.getElementById('umpire-devtools')).toBeNull()
  })

  test('index bundle mounts the built panel and react bundle exports hooks', () => {
    expect(typeof reactBundle.useUmpire).toBe('function')
    expect(typeof reactBundle.useUmpireWithDevtools).toBe('function')

    indexBundle.register(smokeId, demoUmp, { email: 'alex@example.com' })

    const cleanup = indexBundle.mount()

    expect(document.getElementById('umpire-devtools')).not.toBeNull()

    cleanup()

    expect(document.getElementById('umpire-devtools')).toBeNull()
  })
})
