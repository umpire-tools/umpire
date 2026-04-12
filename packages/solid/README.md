# @umpire/solid

Solid adapter package for deriving Umpire availability from reactive state, whether the state is local to one component or shared through a Solid store/context boundary.

[Docs](https://sdougbrown.github.io/umpire/)

## Install

```bash
npm install @umpire/solid @umpire/core solid-js
```

## `useUmpire()`

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

## `fromSolidStore()`

Use `fromSolidStore()` when one shared Solid store should back a single Umpire instance for many children.

```ts
import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { enabledWhen, umpire } from '@umpire/core'
import { fromSolidStore } from '@umpire/solid'

const eventUmp = umpire({
  fields: {
    allDay: { default: false },
    startTime: { default: '' },
    endTime: { default: '' },
  },
  rules: [
    enabledWhen('startTime', (values) => !values.allDay),
    enabledWhen('endTime', (values) => !values.allDay),
  ],
})

const [values, setValues] = createStore({
  allDay: false,
  startTime: '09:00',
  endTime: '10:00',
})

const [tier] = createSignal<'free' | 'pro'>('pro')

const form = fromSolidStore(eventUmp, {
  values,
  set: (name, value) => setValues(name, value),
  conditions: {
    tier,
  },
})

form.field('startTime').enabled
form.fouls
form.set('allDay', true)
form.update({ startTime: '', endTime: '' })
```

`fromSolidStore()` is the shared-form option. It builds on the signal adapter internally, so child components can read `field(name)` without each mounting their own snapshot hook.

## Returned Shape

```ts
const { check, fouls } = useUmpire(ump, values, conditions)
// check().fieldName.enabled
// check().fieldName.fair
// check().fieldName.reason
// fouls(): Foul[]
```

```ts
const form = fromSolidStore(ump, { values, set, conditions })
// form.field('fieldName').enabled
// form.foul('fieldName')
// form.values
// form.fouls
// form.set('fieldName', nextValue)
// form.update({ fieldName: nextValue })
// form.dispose()
```

## Notes

- `values` and `conditions` are accessors, not plain objects.
- `check()` and `fouls()` are accessors, not plain values.
- Do not mirror `check()` into another store or recompute Umpire inside `createEffect`.
- Use `fromSolidStore()` when a shared Solid store or context should drive one Umpire instance for many children.

## Docs

https://sdougbrown.github.io/umpire/
