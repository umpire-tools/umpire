# @umpire/core

Pure field-availability logic for any state with interdependent options. No framework code, no subscriptions, no runtime dependencies.

[Docs](https://sdougbrown.github.io/umpire/)

## Install

```bash
npm install @umpire/core
```

## Quick Example

```ts
import { enabledWhen, requires, umpire } from '@umpire/core'

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

const availability = signupUmp.check(
  { email: 'alex@example.com', password: 'hunter2' },
  { plan: 'business' },
)

availability.companySize
// { enabled: false, required: false, reason: 'requires companyName', reasons: ['requires companyName'] }

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

## API Overview

- `umpire({ fields, rules })` creates an instance with a validated dependency graph.
- `ump.check(values, conditions?, prev?)` returns an `AvailabilityMap`.
- `ump.play(before, after)` returns `Foul[]`.
- `ump.init(overrides?)` returns default field values.
- `ump.challenge(field, values, conditions?, prev?)` returns a debug trace for one field.
- `ump.graph()` returns the structural dependency graph.

See the docs for full type details and behavior notes: https://sdougbrown.github.io/umpire/

## Rule Types

- `enabledWhen(field, predicate, options?)`
- `disables(source, targets, options?)`
- `requires(field, ...dependencies)`
- `oneOf(groupName, branches, options?)`
- `anyOf(...rules)`
- `check(field, validator)` to turn a validator into a reusable predicate

## Docs

https://sdougbrown.github.io/umpire/
