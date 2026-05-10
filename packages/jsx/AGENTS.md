# @umpire/jsx

JSX pragma adapter for Umpire. Lets you define fields and rules as a JSX tree instead of plain TypeScript objects. Intended as an onboarding surface — not a replacement for the full API.

## Usage

Add `/** @jsxImportSource @umpire/jsx */` at the top of any `.tsx` file (or name it `.ump.tsx`):

```tsx
/** @jsxRuntime automatic */
/** @jsxImportSource @umpire/jsx */

import { Field, Requires, Disables, Umpire } from '@umpire/jsx'

const ump = (
  <Umpire>
    <Field name="name" />
    <Field name="age" required>
      <Requires dep="name" />
    </Field>
    <Field name="guestMode">
      <Disables fields={['email', 'password']} />
    </Field>
    <Field name="email" required />
    <Field name="password" required />
  </Umpire>
)

ump.check({
  name: 'Doug',
  age: null,
  guestMode: null,
  email: null,
  password: null,
})
```

## Components

- `<Field name required? isEmpty?>` — defines a field; maps to `field()` from `@umpire/core`
- `<Requires dep="..." />` — nested inside `<Field>`, maps to `requires(target, dep)`. Target is disabled until dep is satisfied and available.
- `<Disables fields={[...]} />` — nested inside `<Field>`, maps to `disables(source, targets)`. Source field disables the listed targets when it holds a value.
- `<Umpire>` — root element; collects all `<Field>` children and returns a live `Umpire` instance via `umpire({ fields, rules })`.

## Design constraints

- `<Umpire>` only accepts `<Field>` as direct children.
- `<Requires>` and `<Disables>` only make sense nested inside `<Field>`.
- `when` predicates for value-based conditions are not supported in v0.1 — use the core API directly for those cases.
- The return value of the JSX expression is the same `Umpire` instance as `umpire()` from core, so all core methods (`.check()`, `.challenge()`, `.play()`, etc.) are available.
