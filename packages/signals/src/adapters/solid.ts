import type { SignalProtocol } from '../protocol.js'

// solid-js is an optional peer dependency.
// This file only compiles/runs when the consumer has it installed.
// Bun test resolution in this repo needs the explicit runtime entry.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — types unavailable unless solid-js is installed
import { createSignal, createMemo, createEffect, createRoot, onCleanup, batch } from 'solid-js/dist/solid.js'

export const solidAdapter: SignalProtocol = {
  signal<T>(initial: T) {
    const [get, set] = createSignal<T>(initial)
    return {
      get,
      set: (value: T) => set(() => value),
    }
  },
  computed(fn) {
    const c = createMemo(fn)
    return { get: c }
  },
  effect(fn) {
    // createEffect must run inside a reactive root. Wrapping in createRoot
    // gives us a dispose function for cleanup — required when reactiveUmp()
    // is called outside of a component's reactive scope (e.g. in a store or
    // service). Inside a component, disposal is handled automatically.
    let disposeFn: () => void = () => {}
    createRoot((dispose: () => void) => {
      disposeFn = dispose
      createEffect(() => {
        const cleanup = fn()
        if (typeof cleanup === 'function') {
          onCleanup(cleanup)
        }
      })
    })
    return disposeFn
  },
  batch,
}
