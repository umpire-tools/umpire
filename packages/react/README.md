# @umpire/react

React hook for deriving Umpire availability and reset recommendations from your current form state.

[Docs](https://sdougbrown.github.io/umpire/)

## Install

```bash
npm install @umpire/react @umpire/core
```

Peer dependencies: `react >= 18`

## Usage

```tsx
import { enabledWhen, requires, umpire } from '@umpire/core'
import { useUmpire } from '@umpire/react'

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

function SignupForm({
  values,
  plan,
}: {
  values: Record<string, unknown>
  plan: 'personal' | 'business'
}) {
  const { check, penalties } = useUmpire(signupUmp, values, { plan })

  check.companyName.enabled
  check.companyName.reason
  penalties

  return null
}
```

`useUmpire()` stays deliberately thin. It derives `check` with `useMemo`, tracks the previous snapshot with `useRef`, and computes `penalties` without `useEffect`.

## Returned Shape

```ts
const { check, penalties } = useUmpire(ump, values, context)
// check.fieldName.enabled
// check.fieldName.reason
// penalties: ResetRecommendation[]
```

## Docs

https://sdougbrown.github.io/umpire/
