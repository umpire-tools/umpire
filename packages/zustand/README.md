# @umpire/zustand

Zustand adapter for Umpire. Subscribe once to a store slice, derive availability, and get reset recommendations from Zustand's native `(next, prev)` subscription flow.

[Docs](https://sdougbrown.github.io/umpire/)

## Install

```bash
npm install @umpire/zustand @umpire/core
```

Peer dependencies: `zustand >= 4`

## Usage

```ts
import { createStore } from 'zustand/vanilla'
import { enabledWhen, umpire } from '@umpire/core'
import { fromStore } from '@umpire/zustand'

const signupUmp = umpire({
  fields: {
    username: {},
    password: {},
    confirmPassword: { default: '' },
    inviteCode: { default: '' },
  },
  rules: [
    enabledWhen('confirmPassword', (values) => {
      return (values.password as string)?.length > 0
    }),
    enabledWhen('inviteCode', (_values, ctx) => ctx.requireInvite, {
      reason: 'invite required',
    }),
  ],
})

const store = createStore(() => ({
  username: '',
  password: '',
  confirmPassword: '',
  inviteCode: '',
  requireInvite: false,
}))

const availability = fromStore(signupUmp, store, {
  select: (state) => ({
    username: state.username,
    password: state.password,
    confirmPassword: state.confirmPassword,
    inviteCode: state.inviteCode,
  }),
  context: (state) => ({
    requireInvite: state.requireInvite,
  }),
})

availability.field('confirmPassword').enabled
availability.penalties
availability.getAvailability()

const unsubscribe = availability.subscribe((next) => {
  console.log(next.confirmPassword.enabled)
})

unsubscribe()
availability.destroy()
```

## API

- `field(name)` returns the current `FieldAvailability` for one field.
- `penalties` returns the latest `ResetRecommendation[]`.
- `getAvailability()` returns the full `AvailabilityMap`.
- `subscribe(listener)` notifies when availability is recomputed.
- `destroy()` unsubscribes from the store and clears listeners.

## Why Zustand Fits

Zustand subscriptions provide both `next` and `prev` state, so `fromStore()` can compute penalties without extra bookkeeping. Availability and reset recommendations stay derived from store transitions rather than form-side effects.

## Docs

https://sdougbrown.github.io/umpire/
