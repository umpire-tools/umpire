import type { SignalProtocol } from '../protocol.js'

// signal-polyfill is an optional peer dependency.
// This file only compiles/runs when the consumer has it installed.
// Bun test resolution in this repo needs the explicit dist entry.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — types unavailable unless signal-polyfill is installed
import { Signal } from 'signal-polyfill/dist/index.js'

export const tc39Adapter: SignalProtocol = {
  signal(initial) {
    return new Signal.State(initial)
  },
  computed(fn) {
    return new Signal.Computed(fn)
  },
  // TC39 has no effect or batch — omit both.
  // fouls tracking unavailable; check/field availability still works.
}
