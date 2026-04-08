# @umpire/signals

Signal adapter for Umpire. Bring your own signal implementation through `SignalProtocol`, or use one of the packaged adapters.

[Docs](https://sdougbrown.github.io/umpire/)

## Install

```bash
npm install @umpire/signals @umpire/core
```

Install a compatible signal library if you want a ready-made adapter, for example `alien-signals`, `@preact/signals-core`, or `signal-polyfill`.

## SignalProtocol

```ts
interface SignalProtocol {
  signal<T>(initial: T): { get(): T; set(value: T): void }
  computed<T>(fn: () => T): { get(): T }
  effect?(fn: () => void | (() => void)): () => void
  batch?(fn: () => void): void
}
```

`effect()` is optional for availability tracking, but required for `fouls`. `batch()` is optional and used by `update()`.

## Usage

```ts
import { enabledWhen, requires, umpire } from '@umpire/core'
import { reactiveUmp } from '@umpire/signals'
import { alienAdapter } from '@umpire/signals/alien'

const signupUmp = umpire({
  fields: {
    email:           { required: true, isEmpty: (v) => !v },
    password:        { required: true, isEmpty: (v) => !v },
    confirmPassword: { required: true, isEmpty: (v) => !v },
    companyName:     {},
    companySize:     {},
  },
  rules: [
    requires('confirmPassword', 'password'),
    enabledWhen('companyName', (_values, ctx) => ctx.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_values, ctx) => ctx.plan === 'business', {
      reason: 'business plan required',
    }),
    requires('companySize', 'companyName'),
  ],
})

const form = reactiveUmp(signupUmp, alienAdapter, {
  context: {
    plan: { get: () => 'personal' as const },
  },
})

form.field('companyName').enabled
form.field('companyName').reason

form.set('password', 'hunter2')
form.update({ companyName: 'Acme', companySize: '50' })
form.values
form.fouls

form.dispose()
```

## Owned vs External Signals

Owned mode lets Umpire create one writable signal per field from `ump.init()`:

```ts
const form = reactiveUmp(signupUmp, alienAdapter)
```

External mode lets you supply your own field and context signals:

```ts
const email = alienAdapter.signal('')
const password = alienAdapter.signal('')
const plan = alienAdapter.signal<'personal' | 'business'>('personal')

const form = reactiveUmp(signupUmp, alienAdapter, {
  signals: {
    email,
    password,
  },
  context: {
    plan: { get: () => plan.get() },
  },
})
```

## Subpath Exports

- `@umpire/signals/alien`
- `@umpire/signals/preact`
- `@umpire/signals/tc39`
- `@umpire/signals/vue`
- `@umpire/signals/solid`
- `@umpire/signals/protocol`

## Fouls and `effect()`

If the adapter does not provide `effect()`, field availability still works, but fouls tracking is unavailable. Accessing `form.fouls` in that mode throws, which is expected for the TC39 adapter.

## Docs

https://sdougbrown.github.io/umpire/
