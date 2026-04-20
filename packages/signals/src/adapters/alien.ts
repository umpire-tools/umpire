import type { SignalProtocol } from '../protocol.js'

// alien-signals is an optional peer dependency.
// This file only compiles/runs when the consumer has it installed.
// Bun resolves the package entry in tests in a way that misses ESM symbols;
// the explicit /esm entry keeps adapter tests stable in this repo.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — types unavailable unless alien-signals is installed
import { signal, computed, effect, startBatch, endBatch } from 'alien-signals/esm'

export const alienAdapter: SignalProtocol = {
  signal(initial) {
    const s = signal(initial)
    return { get: () => s(), set: (v) => s(v) }
  },
  computed(fn) {
    const c = computed(fn)
    return { get: () => c() }
  },
  effect(fn) {
    return effect(fn) as () => void
  },
  batch(fn) {
    startBatch()
    try {
      fn()
    } finally {
      endBatch()
    }
  },
}
