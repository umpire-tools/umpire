# @umpire/pinia

Pinia adapter for Umpire. It snapshots previous `$state`, then delegates to `@umpire/store`.

[Docs](https://umpire.tools/)

## Install

```bash
npm install @umpire/pinia @umpire/core pinia
```

## Usage

```ts
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { enabledWhen, umpire } from '@umpire/core'
import { fromPiniaStore } from '@umpire/pinia'

setActivePinia(createPinia())

const useAccountStore = defineStore('account', {
  state: () => ({
    password: '',
    confirmPassword: '',
  }),
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

const store = useAccountStore()

const umpStore = fromPiniaStore(ump, store, {
  select: (state) => ({
    password: state.password,
    confirmPassword: state.confirmPassword,
  }),
})
```
