---
title: '@umpire/react'
description: A thin React hook that memoizes availability and penalties without effects.
---

# `@umpire/react`

`@umpire/react` is intentionally small. It does not add a subscription layer or side-effect system. It just derives `check()` and `flag()` results during render.

## Install

```bash
npm install @umpire/core @umpire/react
```

## `useUmpire()`

```ts
import { useUmpire } from '@umpire/react'

function useUmpire<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  values: FieldValues<F>,
  context?: C,
): {
  check: AvailabilityMap<F>
  penalties: ResetRecommendation<F>[]
}
```

## Behavior

- `check` is memoized from `ump.check(values, context, prevValues)`.
- `penalties` is memoized from `ump.flag(previousSnapshot, currentSnapshot)`.
- Previous values are tracked internally with `useRef`.
- There is no `useEffect()`.

That means the hook is pure derivation. You decide what to do with `penalties` in event handlers or higher-level state logic.

## Example

```tsx
import { useState } from 'react'
import { useUmpire } from '@umpire/react'
import { enabledWhen, requires, umpire } from '@umpire/core'

const fields = {
  email: { required: true, isEmpty: (value) => !value },
  password: { required: true, isEmpty: (value) => !value },
  confirmPassword: { required: true, isEmpty: (value) => !value },
  companyName: {},
  companySize: {},
}

type SignupContext = {
  plan: 'personal' | 'business'
}

const signupUmp = umpire<typeof fields, SignupContext>({
  fields,
  rules: [
    requires('confirmPassword', 'password'),
    enabledWhen('companyName', (_values, context) => context.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_values, context) => context.plan === 'business', {
      reason: 'business plan required',
    }),
    requires('companySize', 'companyName'),
  ],
})

export function SignupForm() {
  const [plan, setPlan] = useState<SignupContext['plan']>('personal')
  const [values, setValues] = useState(() => signupUmp.init())
  const { check, penalties } = useUmpire(signupUmp, values, { plan })

  return (
    <form>
      <label>
        Plan
        <select
          value={plan}
          onChange={(event) => setPlan(event.currentTarget.value as SignupContext['plan'])}
        >
          <option value="personal">Personal</option>
          <option value="business">Business</option>
        </select>
      </label>

      <label>
        Password
        <input
          value={String(values.password ?? '')}
          onChange={(event) =>
            setValues((current) => ({ ...current, password: event.currentTarget.value }))
          }
        />
      </label>

      {check.confirmPassword.enabled && (
        <label>
          Confirm password
          <input
            value={String(values.confirmPassword ?? '')}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                confirmPassword: event.currentTarget.value,
              }))
            }
          />
        </label>
      )}

      {check.companyName.enabled && (
        <label>
          Company name
          <input
            value={String(values.companyName ?? '')}
            onChange={(event) =>
              setValues((current) => ({ ...current, companyName: event.currentTarget.value }))
            }
          />
        </label>
      )}

      {!check.companyName.enabled && <p>{check.companyName.reason}</p>}
      {penalties.length > 0 && <pre>{JSON.stringify(penalties, null, 2)}</pre>}
    </form>
  )
}
```

## Notes

- The hook does not apply recommendations automatically.
- Passing stable `values` and `context` objects keeps memoization effective.
- `prev` handling for `oneOf()` is already wired in through the internal ref.
