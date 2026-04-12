# 🛂 Umpire

> Rule the form. Play the field.

Umpire is a declarative field-availability engine. Define fields, declare rules between them, and Umpire tells you which fields are in play — and which stale values just fell out. It answers a structural question, not a validation question: given the current values and conditions, what should be enabled right now?

Forms are the most common use case, but Umpire works anywhere state fits a plain object with interdependent options — game boards, config panels, pricing calculators, permission matrices. If it has fields and rules, Umpire can call the game.

[Docs](https://sdougbrown.github.io/umpire/) • [GitHub](https://github.com/sdougbrown/umpire)

[![Coverage Status](https://coveralls.io/repos/github/sdougbrown/umpire/badge.svg?branch=main)](https://coveralls.io/github/sdougbrown/umpire?branch=main)

## Quick Example

```ts
import { enabledWhen, requires, umpire } from '@umpire/core'

const signupUmp = umpire({
  fields: {
    email:           { required: true, isEmpty: (v) => !v },
    password:        { required: true, isEmpty: (v) => !v },
    confirmPassword: { required: true, isEmpty: (v) => !v },
    referralCode:    {},
    companyName:     {},
    companySize:     {},
  },
  rules: [
    requires('confirmPassword', 'password'),
    enabledWhen('companyName', (_values, cond) => cond.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_values, cond) => cond.plan === 'business', {
      reason: 'business plan required',
    }),
    requires('companySize', 'companyName'),
  ],
})

const availability = signupUmp.check(
  { email: 'alex@example.com', password: 'hunter2' },
  { plan: 'personal' },
)

availability.companyName
// { enabled: false, required: false, reason: 'business plan required', reasons: ['business plan required'] }

const fouls = signupUmp.play(
  {
    values: {
      email: 'alex@example.com',
      password: 'hunter2',
      companyName: 'Acme',
      companySize: '50',
    },
    conditions: { plan: 'business' },
  },
  {
    values: {
      email: 'alex@example.com',
      password: 'hunter2',
      companyName: 'Acme',
      companySize: '50',
    },
    conditions: { plan: 'personal' },
  },
)

// [
//   { field: 'companyName', reason: 'business plan required', suggestedValue: undefined },
//   { field: 'companySize', reason: 'business plan required', suggestedValue: undefined },
// ]
```

## Packages

| Package | Purpose |
| --- | --- |
| [`@umpire/core`](./packages/core/README.md) | Pure logic engine with zero runtime dependencies |
| [`@umpire/react`](./packages/react/README.md) | `useUmpire()` hook for React |
| [`@umpire/solid`](./packages/solid/README.md) | `useUmpire()` hook for Solid |
| [`@umpire/signals`](./packages/signals/README.md) | Signal adapter via `SignalProtocol` (Jotai, Preact, Alien Signals, TC39) |
| [`@umpire/store`](./packages/store/README.md) | Generic store adapter — bring your own `getState()` + `subscribe(next, prev)` |
| [`@umpire/zustand`](./packages/zustand/README.md) | Zustand adapter (satisfies the store contract natively) |
| [`@umpire/redux`](./packages/redux/README.md) | Redux / Redux Toolkit adapter |
| [`@umpire/tanstack-store`](./packages/tanstack-store/README.md) | TanStack Store adapter |
| [`@umpire/pinia`](./packages/pinia/README.md) | Pinia adapter (Vue 3) |
| [`@umpire/vuex`](./packages/vuex/README.md) | Vuex 4 adapter (Vue 3) |
| [`@umpire/zod`](./packages/zod/README.md) | Availability-aware Zod schemas — disabled fields produce no errors |
| [`@umpire/reads`](./packages/reads/README.md) | Derived read tables and read-backed rule bridges |
| [`@umpire/testing`](./packages/testing/README.md) | Invariant probes for rule configurations |
| [`@umpire/devtools`](./packages/devtools/README.md) | In-app inspector panel — scorecard, traces, foul log, graph view |

## Why Umpire?

- Pure logic, zero dependencies.
- Declarative rules: `requires`, `disables`, `enabledWhen`, `fairWhen`, `oneOf`.
- Recommendations, not mutations: `play()` suggests resets, you decide when to apply them.
- Adapters for React, Solid, Zustand, Redux, TanStack Store, Pinia, Vuex, and signals.
- Debuggable: `challenge()` traces why any field was ruled out, `@umpire/devtools` surfaces it visually.

## Install

```bash
npm install @umpire/core
```

Published packages do not require Bun to consume.

## Contributing

Local repo work expects:

- Node 24+
- Yarn 4
- Bun 1.2+

`yarn test` and `yarn test:coverage` use Bun under the hood, so those commands will fail if Bun is not installed.

## Docs

Full docs, concepts, and examples live at https://sdougbrown.github.io/umpire/

## Droid-Friendly

Each published package ships a tight `AGENTS.md` file for cross-agent discoverability, with `.claude/rules/*` included as a Claude-specific compatibility surface. In this repo, `AGENTS.md` is canonical and `CLAUDE.md` plus `.cursor/rules/` are compatibility symlinks.

## Status

Alpha.

## License

MIT
