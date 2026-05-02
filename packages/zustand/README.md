# @umpire/zustand

Zustand entry point for Umpire's generic store adapter. Zustand satisfies the `@umpire/store` contract natively, so this package re-exports `fromStore()` with a named ecosystem entry point.

[Docs](https://umpire.tools/)

## Install

```bash
npm install @umpire/zustand @umpire/core zustand
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
  conditions: (state) => ({
    requireInvite: state.requireInvite,
  }),
})

availability.field('confirmPassword').enabled
availability.fouls
availability.getAvailability()

const unsubscribe = availability.subscribe((next) => {
  console.log(next.confirmPassword.enabled)
})

unsubscribe()
availability.destroy()
```

## API

- `field(name)` returns the current `FieldStatus` for one field.
- `fouls` returns the latest `Foul[]`.
- `getAvailability()` returns the full `AvailabilityMap`.
- `subscribe(listener)` notifies when availability is recomputed.
- `destroy()` unsubscribes from the store and clears listeners.

## Why Zustand Fits

Zustand subscriptions provide both `next` and `prev` state, so `fromStore()` can compute fouls without extra bookkeeping. The implementation now lives in `@umpire/store`; this package keeps the Zustand-specific import path intact for existing users.

## Docs

https://umpire.tools/
