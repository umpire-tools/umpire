# @umpire/tanstack-store

TanStack Store adapter for Umpire. It snapshots previous `.state`, then delegates to `@umpire/store`.

[Docs](https://umpire.tools/)

## Install

```bash
npm install @umpire/tanstack-store @umpire/core @tanstack/store
```

## Usage

```ts
import { createStore } from '@tanstack/store'
import { enabledWhen, umpire } from '@umpire/core'
import { fromTanStackStore } from '@umpire/tanstack-store'

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

const store = createStore({
  password: '',
  confirmPassword: '',
})

const umpStore = fromTanStackStore(ump, store, {
  select: (state) => ({
    password: state.password,
    confirmPassword: state.confirmPassword,
  }),
})
```
