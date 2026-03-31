---
title: '@umpire/signals'
description: Signal-backed availability with fine-grained tracking through a minimal protocol.
---

# `@umpire/signals`

`@umpire/signals` adapts the pure core to any signal library that matches the `SignalProtocol` interface.

## Install

```bash
npm install @umpire/core @umpire/signals
```

Bring your own signal implementation or one of the shipped adapter entry points.

## `SignalProtocol`

```ts
interface SignalProtocol {
  signal<T>(initial: T): { get(): T; set(value: T): void }
  computed<T>(fn: () => T): { get(): T }
  effect?(fn: () => void | (() => void)): () => void
  batch?(fn: () => void): void
}
```

`effect` and `batch` are optional at the protocol level, but `effect` is required if you want `penalties`.

## `reactiveUmp()`

```ts
import type { SignalProtocol } from '@umpire/signals'
import { reactiveUmp } from '@umpire/signals'

function reactiveUmp<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  adapter: SignalProtocol,
  options?: {
    signals?: Partial<Record<keyof F & string, { get(): unknown; set(value: unknown): void }>>
    conditions?: Record<string, { get(): unknown }>
  },
): ReactiveUmpire<F>
```

## Return Surface

```ts
type ReactiveField = {
  readonly enabled: boolean
  readonly required: boolean
  readonly reason: string | null
  readonly reasons: string[]
}

interface ReactiveUmpire<F extends Record<string, FieldDef>> {
  field(name: keyof F & string): ReactiveField
  set(name: keyof F & string, value: unknown): void
  update(partial: Partial<Record<keyof F & string, unknown>>): void
  readonly values: Record<keyof F & string, unknown>
  readonly penalties: ResetRecommendation<F>[]
  dispose(): void
}
```

## Owned Signals

If you do not pass `options.signals`, `reactiveUmp()` creates one writable signal per field using `ump.init()`.

```ts
const reactive = reactiveUmp(recurrenceUmp, adapter)

reactive.field('startTime').enabled
reactive.set('startTime', '09:00')
reactive.update({ endTime: '17:00', repeatEvery: 30 })
reactive.values
```

## External Signals

If your values already live in signals, pass them in. Unspecified fields still get owned signals.

```ts
const reactive = reactiveUmp(recurrenceUmp, adapter, {
  signals: {
    startTime: startTimeSignal,
    endTime: endTimeSignal,
    repeatEvery: repeatEverySignal,
  },
})
```

That avoids duplicating state.

## Conditions Signals

Conditions can also be reactive.

```ts
const reactive = reactiveUmp(loginUmp, adapter, {
  conditions: {
    captchaToken: captchaTokenSignal,
  },
})
```

Changing `captchaTokenSignal` recomputes availability just like changing a field signal.

## Penalties Tracking

`penalties` depends on `effect()`.

The adapter uses an effect to advance an internal "before" snapshot whenever field or conditions signals change, then computes `ump.flag(before, after)` from that transition.

If the protocol does not provide `effect()`:

- creation logs a warning
- field availability still works
- reading `penalties` throws

## Proxy-Based Fine-Grained Tracking

Predicates receive a `values` object, but internally that object is a `Proxy` that forwards property access to field signals.

That means:

- `values.startTime` only tracks `startTime`
- destructuring specific fields still tracks only those fields
- spreading or enumerating all keys defeats fine-grained tracking

Avoid patterns like:

```ts
const snapshot = { ...values }
Object.keys(values)
JSON.stringify(values)
```

Those patterns cause all field signals to be read.

## Adapter Examples

```ts
import { computed, effect, signal } from '@preact/signals-core'

const preactAdapter: SignalProtocol = {
  signal(initial) {
    const s = signal(initial)
    return { get: () => s.value, set: (value) => { s.value = value } }
  },
  computed(fn) {
    const c = computed(fn)
    return { get: () => c.value }
  },
  effect,
}
```

```ts
import { Signal } from 'signal-polyfill'

const tc39Adapter: SignalProtocol = {
  signal(initial) {
    return new Signal.State(initial)
  },
  computed(fn) {
    return new Signal.Computed(fn)
  },
}
```

The TC39-shaped adapter works for field availability, but not for `penalties`, because it has no `effect()`.
