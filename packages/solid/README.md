# @umpire/solid

Solid component adapter for deriving Umpire availability and reset recommendations from reactive state.

[Docs](https://sdougbrown.github.io/umpire/)

## Install

```bash
npm install @umpire/solid @umpire/core solid-js
```

## Usage

```ts
import { createStore } from 'solid-js/store'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { useUmpire } from '@umpire/solid'

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
    enabledWhen('companyName', (_values, conditions) => conditions.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_values, conditions) => conditions.plan === 'business', {
      reason: 'business plan required',
    }),
    requires('companySize', 'companyName'),
  ],
})

function SignupForm() {
  const [values] = createStore({
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    companySize: '',
  })

  const { check, fouls } = useUmpire(signupUmp, () => values, () => ({ plan: 'business' as const }))

  check().companyName.enabled
  check().companyName.reason
  fouls()

  return null
}
```

`useUmpire()` stays deliberately thin. It reads values through accessors, derives `check()` and `fouls()` together, and tracks the previous snapshot internally so consumers do not need their own `createEffect` bookkeeping.

## Returned Shape

```ts
const { check, fouls } = useUmpire(ump, values, conditions)
// check().fieldName.enabled
// check().fieldName.fair
// check().fieldName.reason
// fouls(): Foul[]
```

## Notes

- `values` and `conditions` are accessors, not plain objects.
- `check()` and `fouls()` are accessors, not plain values.
- Do not mirror `check()` into another store or recompute Umpire inside `createEffect`.
- Use `@umpire/signals` when you want fine-grained field-level reactive reads rather than a component-level snapshot adapter.

## Docs

https://sdougbrown.github.io/umpire/
