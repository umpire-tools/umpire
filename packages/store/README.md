# @umpire/store

Generic store adapter foundation for Umpire. Use it when your store can provide `getState()` plus `subscribe((next, prev) => unsubscribe)`.

[Docs](https://sdougbrown.github.io/umpire/)

## Install

```bash
npm install @umpire/store @umpire/core
```

## Usage

```ts
import { createStore } from 'zustand/vanilla'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { fromStore } from '@umpire/store'

const accountUmp = umpire({
  fields: {
    email: { required: true, default: '', isEmpty: (v) => !v },
    teamSize: { default: '', isEmpty: (v) => !v },
    teamDomain: { default: '', isEmpty: (v) => !v },
  },
  rules: [
    enabledWhen('teamSize', (_values, cond) => cond.plan === 'team', {
      reason: 'team plan required',
    }),
    requires('teamDomain', (values) => Number(values.teamSize ?? 0) > 0, {
      reason: 'team size must be greater than 0',
    }),
  ],
})

const store = createStore(() => ({
  profile: { email: '' },
  billing: { plan: 'personal' as 'personal' | 'team' },
  team: { size: '', domain: '' },
}))

const umpStore = fromStore(accountUmp, store, {
  select: (state) => ({
    email: state.profile.email,
    teamSize: state.team.size,
    teamDomain: state.team.domain,
  }),
  conditions: (state) => ({
    plan: state.billing.plan,
  }),
})
```

`select()` is the aggregation point. Umpire does not care how many slices or components own the backing state as long as the adapter can assemble one values object.

## For Other Store Libraries

- `@umpire/zustand` re-exports `fromStore()` directly because Zustand already supplies `(next, prev)`.
- `@umpire/redux` and `@umpire/tanstack-store` normalize their subscription APIs, then delegate here.

Signal-based stores like Jotai, Valtio, MobX, and Preact signals are not covered by this package. Those fit `@umpire/signals` more naturally and need a separate bridge story.
