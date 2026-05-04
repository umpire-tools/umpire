import { describe, it, expect, mock } from 'bun:test'
import { createReads } from '@umpire/reads'
import { umpireReadListeners } from '../src/reads.js'

describe('umpireReadListeners', () => {
  it('calls handler with current and no previous read on first invocation', () => {
    const reads = createReads<{ x: number }, { doubled: number }>({
      doubled: ({ input }) => input.x * 2,
    })

    const handler = mock(() => {})
    const listeners = umpireReadListeners(reads, { doubled: handler })

    const formApi = { state: { values: { x: 5 } } }
    ;(listeners.onChange as Function)({ formApi })

    expect(handler).toHaveBeenCalledTimes(1)
    const call = handler.mock.calls[0][0]
    expect(call.read).toBe(10)
    expect(call.previousRead).toBeUndefined()
    expect(call.values).toEqual({ x: 5 })
    expect(call.previousValues).toBeUndefined()
  })

  it('second invocation provides both current and previous read values', () => {
    const reads = createReads<{ x: number }, { doubled: number }>({
      doubled: ({ input }) => input.x * 2,
    })

    const handler = mock(() => {})
    const listeners = umpireReadListeners(reads, { doubled: handler })

    const formApi1 = { state: { values: { x: 5 } } }
    ;(listeners.onChange as Function)({ formApi: formApi1 })

    const formApi2 = { state: { values: { x: 10 } } }
    ;(listeners.onChange as Function)({ formApi: formApi2 })

    expect(handler).toHaveBeenCalledTimes(2)
    const secondCall = handler.mock.calls[1][0]
    expect(secondCall.read).toBe(20)
    expect(secondCall.previousRead).toBe(10)
    expect(secondCall.values).toEqual({ x: 10 })
    expect(secondCall.previousValues).toEqual({ x: 5 })
  })

  it('multiple handlers for different reads are all called', () => {
    const reads = createReads<{ x: number; y: number }, { sum: number; product: number }>({
      sum: ({ input }) => input.x + input.y,
      product: ({ input }) => input.x * input.y,
    })

    const sumHandler = mock(() => {})
    const productHandler = mock(() => {})
    const listeners = umpireReadListeners(reads, { sum: sumHandler, product: productHandler })

    const formApi = { state: { values: { x: 3, y: 4 } } }
    ;(listeners.onChange as Function)({ formApi })

    expect(sumHandler).toHaveBeenCalledTimes(1)
    expect(productHandler).toHaveBeenCalledTimes(1)
    expect(sumHandler.mock.calls[0][0].read).toBe(7)
    expect(productHandler.mock.calls[0][0].read).toBe(12)
  })

  it('missing handler (undefined) does not throw', () => {
    const reads = createReads<{ x: number }, { doubled: number }>({
      doubled: ({ input }) => input.x * 2,
    })

    const listeners = umpireReadListeners(reads, { doubled: undefined })

    const formApi = { state: { values: { x: 5 } } }
    expect(() => {
      ;(listeners.onChange as Function)({ formApi })
    }).not.toThrow()
  })

  it('onBlur events option produces onBlur listener instead of onChange', () => {
    const reads = createReads<{ x: number }, { doubled: number }>({
      doubled: ({ input }) => input.x * 2,
    })

    const handler = mock(() => {})
    const listeners = umpireReadListeners(reads, { doubled: handler }, { events: ['onBlur'] })

    expect(listeners.onChange).toBeUndefined()
    expect(listeners.onBlur).toBeDefined()
  })

  it('both onChange and onBlur events produce both listeners', () => {
    const reads = createReads<{ x: number }, { doubled: number }>({
      doubled: ({ input }) => input.x * 2,
    })

    const handler = mock(() => {})
    const listeners = umpireReadListeners(reads, { doubled: handler }, { events: ['onChange', 'onBlur'] })

    expect(listeners.onChange).toBeDefined()
    expect(listeners.onBlur).toBeDefined()
  })

  it('debounceMs option is included in result', () => {
    const reads = createReads<{ x: number }, { doubled: number }>({
      doubled: ({ input }) => input.x * 2,
    })

    const handler = mock(() => {})
    const listeners = umpireReadListeners(reads, { doubled: handler }, { debounceMs: 300 })

    expect(listeners['onChangeDebounceMs' as keyof typeof listeners]).toBe(300)
  })

  it('selectInput option transforms values before passing to reads', () => {
    const reads = createReads<{ firstName: string }, { greeting: string }>({
      greeting: ({ input }) => `Hello, ${input.firstName}!`,
    })

    const handler = mock(() => {})
    const selectInput = (values: Record<string, unknown>) => ({
      firstName: (values as { name: string }).name,
    })
    const listeners = umpireReadListeners(reads, { greeting: handler }, { selectInput })

    const formApi = { state: { values: { name: 'Alice' } } }
    ;(listeners.onChange as Function)({ formApi })

    expect(handler).toHaveBeenCalledTimes(1)
    const call = handler.mock.calls[0][0]
    expect(call.read).toBe('Hello, Alice!')
    expect(call.values).toEqual({ firstName: 'Alice' })
  })

  it('previousValues tracks across invocations', () => {
    const reads = createReads<{ x: number }, { doubled: number }>({
      doubled: ({ input }) => input.x * 2,
    })

    const handler = mock(() => {})
    const listeners = umpireReadListeners(reads, { doubled: handler })

    const formApi1 = { state: { values: { x: 1 } } }
    ;(listeners.onChange as Function)({ formApi: formApi1 })

    const formApi2 = { state: { values: { x: 2 } } }
    ;(listeners.onChange as Function)({ formApi: formApi2 })

    const firstCall = handler.mock.calls[0][0]
    const secondCall = handler.mock.calls[1][0]
    expect(firstCall.previousValues).toBeUndefined()
    expect(secondCall.previousValues).toEqual({ x: 1 })
    expect(secondCall.values).toEqual({ x: 2 })
  })

  it('fieldApi is forwarded to handler when present', () => {
    const reads = createReads<{ x: number }, { doubled: number }>({
      doubled: ({ input }) => input.x * 2,
    })

    const handler = mock(() => {})
    const listeners = umpireReadListeners(reads, { doubled: handler })

    const fieldApi = { name: 'x', value: 5 }
    const formApi = { state: { values: { x: 5 } } }
    ;(listeners.onChange as Function)({ formApi, fieldApi })

    expect(handler).toHaveBeenCalledTimes(1)
    const call = handler.mock.calls[0][0]
    expect(call.fieldApi).toBe(fieldApi)
  })

  it('reads.resolve(values) is used — computed read returns correct value', () => {
    const reads = createReads<
      { a: number; b: number },
      { sum: number; difference: number }
    >({
      sum: ({ input }) => input.a + input.b,
      difference: ({ input }) => input.a - input.b,
    })

    const sumHandler = mock(() => {})
    const diffHandler = mock(() => {})
    const listeners = umpireReadListeners(reads, {
      sum: sumHandler,
      difference: diffHandler,
    })

    const formApi = { state: { values: { a: 10, b: 3 } } }
    ;(listeners.onChange as Function)({ formApi })

    expect(sumHandler.mock.calls[0][0].read).toBe(13)
    expect(diffHandler.mock.calls[0][0].read).toBe(7)
  })
})
