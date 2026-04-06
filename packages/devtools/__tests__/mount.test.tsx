import { jest } from '@jest/globals'
import { mount, unmount } from '../dist/index.js'

const originalNodeEnv = process.env.NODE_ENV
const originalInternal = process.env.UMPIRE_INTERNAL

describe('mount', () => {
  afterEach(() => {
    unmount()
    document.body.innerHTML = ''
    process.env.NODE_ENV = originalNodeEnv
    process.env.UMPIRE_INTERNAL = originalInternal
    jest.restoreAllMocks()
  })

  it('creates and removes the shadow host', () => {
    const cleanup = mount()
    const host = document.getElementById('umpire-devtools')

    expect(host).not.toBeNull()
    expect(host?.shadowRoot).not.toBeNull()

    cleanup()

    expect(document.getElementById('umpire-devtools')).toBeNull()
  })

  it('reuses the same host across repeated mounts', () => {
    const cleanupOne = mount()
    const cleanupTwo = mount()
    const hosts = document.querySelectorAll('#umpire-devtools')

    expect(hosts).toHaveLength(1)

    cleanupTwo()
    cleanupOne()

    expect(document.getElementById('umpire-devtools')).toBeNull()
  })

  it('does not mount in production without the internal escape hatch', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.UMPIRE_INTERNAL

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const cleanup = mount()

    expect(document.getElementById('umpire-devtools')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('mounts in production when the internal escape hatch is enabled', () => {
    process.env.NODE_ENV = 'production'
    process.env.UMPIRE_INTERNAL = 'true'

    mount()

    expect(document.getElementById('umpire-devtools')).not.toBeNull()
  })
})
