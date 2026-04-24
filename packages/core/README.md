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
    email: { required: true, isEmpty: (v) => !v },
    password: { required: true, isEmpty: (v) => !v },
    confirmPassword: { required: true, isEmpty: (v) => !v },
    companyName: {},
    companySize: {},
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
// { enabled: false, fair: true, required: false, reason: 'requires companyName', reasons: ['requires companyName'] }

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
- `ump.rules()` returns normalized runtime rule entries with `id`, `index`, and inspection metadata for debugging and test tooling.

See the docs for full type details and behavior notes: https://sdougbrown.github.io/umpire/

## Rule Types

- `requires(field, ...dependencies)` — field stays disabled until dependencies are satisfied and available
- `enabledWhen(field, predicate, options?)` — field enabled only when a predicate returns true
- `fairWhen(field, predicate, options?)` — field's current value is appropriate only when a predicate returns true
- `disables(source, targets, options?)` — active source disables target fields
- `oneOf(groupName, branches, options?)` — only one branch of fields is active at a time
- `anyOf(...rules)` — OR logic: pass if any inner rule passes
- `eitherOf(groupName, branches)` — named OR paths where each branch is a group of ANDed rules
- `check(field, validator)` — bridge validators into rules with preserved field metadata

Use `field<V>('name')` to create a typed field reference. Pass it to `fairWhen` (or any rule) to get a typed `value` parameter instead of `unknown`.

## Docs

https://sdougbrown.github.io/umpire/

## Benchmarks

Benchmark tooling and baseline timings live in [BENCHMARKS.md](./BENCHMARKS.md).
