# @umpire/redux

Redux adapter for Umpire. It tracks previous state internally, then delegates to `@umpire/store`.

[Docs](https://sdougbrown.github.io/umpire/)

## Install

```bash
npm install @umpire/redux @umpire/core redux
```

## Usage

```ts
import { legacy_createStore } from 'redux'
import { enabledWhen, umpire } from '@umpire/core'
import { fromReduxStore } from '@umpire/redux'

const ump = umpire({
  fields: {
    password: {},
    confirmPassword: { default: '' },
  },
  rules: [
    enabledWhen('confirmPassword', (values) => {
      return (values.password as string)?.length > 0
    }),
  ],
})

const store = legacy_createStore((state = { password: '', confirmPassword: '' }, action) => {
  if (action.type === 'patch') {
    return { ...state, ...action.payload }
  }

  return state
})

const umpStore = fromReduxStore(ump, store, {
  select: (state) => ({
    password: state.password,
    confirmPassword: state.confirmPassword,
  }),
})
```
