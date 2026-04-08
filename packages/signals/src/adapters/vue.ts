import type { SignalProtocol } from '../protocol.js'

// vue is an optional peer dependency.
// This file only compiles/runs when the consumer has it installed.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — types unavailable unless vue is installed
import { ref, computed, watchEffect } from 'vue'

export const vueAdapter: SignalProtocol = {
  signal(initial) {
    const s = ref(initial)
    return {
      get: () => s.value,
      set: (v: unknown) => {
        s.value = v
      },
    }
  },
  computed(fn) {
    const c = computed(fn)
    return { get: () => c.value }
  },
  effect(fn) {
    // flush: 'sync' is required — the default async flush causes fouls
    // bookkeeping in reactive.ts to lag by one transition.
    return watchEffect(fn, { flush: 'sync' })
  },
  // Vue automatically batches updates within the same microtask tick.
  // No explicit batch() needed.
}
