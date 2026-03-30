# Umpire

> Reactive field availability for forms with interdependent options.
> *Check the play. Flag the field.*

Umpire is a pure-logic library that models field interdependencies declaratively. It answers one question: **given the current field values, what should be available?**

## Packages

| Package | Purpose |
|---------|---------|
| `@umpire/core` | Pure logic, zero dependencies |
| `@umpire/signals` | Signal adapters (alien-signals, Preact signals, TC39 polyfill) |
| `@umpire/react` | React hook (`useUmpire`) |
| `@umpire/zustand` | Zustand store adapter (`fromStore`) |

## Quick Example

```ts
import { umpire, enabledWhen, requires } from '@umpire/core'

const ump = umpire({
  fields: {
    email:           { required: true },
    password:        { required: true },
    confirmPassword: { required: true },
    companyName:     {},
    companySize:     {},
  },
  rules: [
    requires('confirmPassword', 'password'),
    enabledWhen('companyName', (_v, ctx) => ctx.plan === 'business'),
    enabledWhen('companySize', (_v, ctx) => ctx.plan === 'business'),
    requires('companySize', 'companyName'),
  ],
})

const result = ump.check(
  { email: 'alex@example.com', password: 'hunter2' },
  { plan: 'personal' },
)
// → companyName: { enabled: false, reason: 'business plan required' }
// → companySize: { enabled: false, reason: 'business plan required' }
```

## Status

Early development. Not yet published to npm.
