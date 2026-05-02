# @umpire/vuex

Vuex adapter for Umpire. It snapshots previous state, then delegates to `@umpire/store`.

[Docs](https://umpire.tools/)

## Install

```bash
npm install @umpire/vuex @umpire/core vuex
```

## Usage

```ts
import { createStore } from 'vuex'
import { enabledWhen, umpire } from '@umpire/core'
import { fromVuexStore } from '@umpire/vuex'

const store = createStore({
  state: {
    password: '',
    confirmPassword: '',
  },
  mutations: {
    patch(state, payload) {
      Object.assign(state, payload)
    },
  },
})

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

const umpStore = fromVuexStore(ump, store, {
  select: (state) => ({
    password: state.password,
    confirmPassword: state.confirmPassword,
  }),
})
```
