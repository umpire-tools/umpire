# @umpire/tanstack-form

Use an Umpire availability graph with TanStack Form validators, listeners, conditional field rendering, and stale-value resets.

Umpire decides whether each field is available, satisfied, and appropriate. This package translates those decisions into TanStack Form shapes: field validators, listener dependencies, and small framework adapters for React, Solid, and Vue.

[Full docs](https://umpire.tools/adapters/tanstack-form/)

## Install

Start with the framework-neutral package and TanStack Form core peer:

```bash
yarn add @umpire/core @umpire/tanstack-form @tanstack/form-core
```

Then add the peers for the subpath you import:

| Import                        | Add these peers                                     |
| ----------------------------- | --------------------------------------------------- |
| `@umpire/tanstack-form`       | none beyond `@tanstack/form-core`                   |
| `@umpire/tanstack-form/react` | `react`, `@tanstack/react-form`, `@umpire/react`    |
| `@umpire/tanstack-form/solid` | `solid-js`, `@tanstack/solid-form`, `@umpire/solid` |
| `@umpire/tanstack-form/vue`   | `vue`, `@tanstack/vue-form`                         |

For React:

```bash
yarn add @umpire/core @umpire/tanstack-form @tanstack/form-core @tanstack/react-form @umpire/react react
```

For Solid:

```bash
yarn add @umpire/core @umpire/tanstack-form @tanstack/form-core @tanstack/solid-form @umpire/solid solid-js
```

For Vue:

```bash
yarn add @umpire/core @umpire/tanstack-form @tanstack/form-core @tanstack/vue-form vue
```

## Quick Start (React)

```tsx
import { useForm } from '@tanstack/react-form'
import { enabledWhen, umpire } from '@umpire/core'
import { useUmpireForm } from '@umpire/tanstack-form/react'
import { umpireFieldValidator } from '@umpire/tanstack-form'

const ump = umpire({
  fields: {
    country: {},
    state: { required: true },
    province: {},
  },
  rules: [
    enabledWhen('state', (v) => v.country === 'US'),
    enabledWhen('province', (v) => v.country === 'CA'),
  ],
})

function AddressForm() {
  const form = useForm({ defaultValues: ump.init() })
  const umpireForm = useUmpireForm(form, ump, { strike: true })

  return (
    <form>
      <form.Field name="country">
        {(field) => (
          <input
            value={field.state.value}
            onChange={(e) => field.handleChange(e.currentTarget.value)}
          />
        )}
      </form.Field>

      {umpireForm.field('state').enabled && (
        <form.Field
          name="state"
          validators={umpireFieldValidator(ump, 'state')}
        >
          {(field) => (
            <input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.currentTarget.value)}
            />
          )}
        </form.Field>
      )}

      {umpireForm.field('province').enabled && (
        <form.Field
          name="province"
          validators={umpireFieldValidator(ump, 'province')}
        >
          {(field) => (
            <input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.currentTarget.value)}
            />
          )}
        </form.Field>
      )}
    </form>
  )
}
```

`useUmpireForm` subscribes to form values and returns per-field status. `strike: true` auto-resets stale values when a field becomes disabled (e.g. clearing `state` when the user switches country away from US).

`umpireFieldValidator` produces the `validators` prop for a `Field` — it reads the engine's graph to auto-wire `onChangeListenTo` so dependent fields revalidate when their upstreams change.

## API Surface

### Framework-neutral (`@umpire/tanstack-form`)

```ts
import {
  umpireFieldValidator, // validators object for a single field
  umpireFieldValidators, // validators for every field at once
  umpireDynamicValidator, // whole-form validator (form.state.errorMap.onDynamic)
  createUmpireFormOptions, // spread into useForm options for strike-on-transition
  createUmpireFormAdapter, // low-level adapter, no framework dependency
  umpireReadListeners, // wire @umpire/reads to TanStack Form listeners
  getUmpireLinkedFields, // upstream dependency names for a field
} from '@umpire/tanstack-form'
```

#### `umpireFieldValidator(ump, fieldName, options?)`

Produces a `validators` object for a TanStack Form `Field`. Automatically derives `onChangeListenTo` from the dependency graph.

Options: `conditions`, `events` (default `['onChange']`), `listenTo` (override graph lookup), `rejectFoul` (default `true`).

#### `umpireFieldValidators(engine, options?)`

Generates validators for every field in the graph at once. `listenTo` is omitted (always graph-derived).

#### `umpireDynamicValidator(engine, options?)`

Whole-form validator for `form.options.validators.onDynamic`. Errors land in `form.state.errorMap.onDynamic`, not `field.state.meta.errors`. Use `umpireFieldValidator` instead when you need inline field errors.

#### `createUmpireFormOptions(engine, options?)`

Produces a `{ listeners }` fragment to spread into `useForm` options. Handles strike-on-transition: when a field becomes disabled with a stale value, it resets via `setFieldValue` (default) or `resetField`. Each call owns its own snapshot closure — wrap in `useMemo` in React components.

Options for `strike`: `events`, `debounceMs`, `mode` (`'suggestedValue'` | `'resetField'`).

#### `umpireReadListeners(reads, handlers, options?)`

Connects an `@umpire/reads` `ReadTable` to TanStack Form's listener system. Handlers receive `{ read, previousRead, values, previousValues, formApi, fieldApi }`.

Options: `events`, `debounceMs`, `selectInput`.

#### `getUmpireLinkedFields(engine, fieldName, options?)`

Returns upstream dependency names for a field. Options: `listenTo` (explicit override).

#### `createUmpireFormAdapter(form, engine, options?)`

Low-level adapter with no framework dependency. Returns `{ getField, getAvailability, getFouls, applyStrike, refresh }`. Call `refresh(values)` after external value changes to avoid stale-transition false positives.

### Field status shape

All framework hooks and `createUmpireFormAdapter.getField()` return this shape:

```ts
{
  enabled: boolean    // field is available for input
  available: boolean  // alias for enabled
  disabled: boolean   // alias for !enabled
  required: boolean
  satisfied: boolean
  fair: boolean
  reason: string | null
  reasons: string[]
  error?: string
}
```

### React (`@umpire/tanstack-form/react`)

#### `useUmpireForm(form, ump, options?)`

Hook that subscribes to form values and returns `{ field(name), fouls, applyStrike }`. When `strike: true`, disabled-field cleanup is applied automatically via `useEffect`; validation fouls on still-enabled fields remain visible so users can keep editing. `conditions` can be a value or `() => C`.

#### `UmpireFormSubscribe`

Render-prop component. Same interface without a hook call — useful for availability-derived rendering in a subtree.

#### `createUmpireFormComponents(engine, options?)`

Factory producing `UmpireScope`, `UmpireField`, and `UmpireSubmit`. Works with `createFormHook` from `@tanstack/react-form`. Requires `form.AppForm` in the tree to provide the form context that `UmpireScope` reads.

`UmpireField` hides itself when the field is disabled, auto-wires validators, and passes both the TanStack Form field API and `UmpireFormField` status to children. `UmpireSubmit` disables when fouls exist or the form is submitting.

### Solid (`@umpire/tanstack-form/solid`)

#### `createUmpireForm(form, engine, options?)`

Solid equivalent of `useUmpireForm`. Returns the same `{ field, fouls, applyStrike }` surface with Solid accessor semantics. `conditions` can be a value or `Accessor<C>`. Disabled-field cleanup is applied via `createEffect` when `strike: true`.

#### `UmpireFormSubscribe`

Render-prop component adapted to Solid's reactive primitives.

#### `createUmpireFormComponents(engine, options?)`

Factory producing `UmpireScope`, `UmpireField`, and `UmpireSubmit` for Solid. Works with `createFormHook` from `@tanstack/solid-form`.

### Vue (`@umpire/tanstack-form/vue`)

#### `useUmpireForm(form, ump, options?)`

Composable that tracks form values reactively. `conditions` can be a plain value, a `ref`, a computed, or a function returning `C`. Strike is applied via `watchEffect`.

#### `UmpireFormSubscribe`

Vue component providing `UmpireForm` through a scoped slot (`v-slot="{ umpireForm }"`).

`createUmpireFormComponents` is not available for Vue in v1.
