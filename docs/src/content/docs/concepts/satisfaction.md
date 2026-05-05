---
title: Field Satisfaction Semantics
description: Understand the default presence-based model and when to override it with isEmpty.
---

Most rules need to know whether a field is "present enough" to count. Umpire uses presence-based satisfaction by default, not JavaScript truthiness.

## Default Truth Table

| Value | Satisfied by default? | Why |
| --- | --- | --- |
| `undefined` | No | Not set |
| `null` | No | Explicitly empty |
| `0` | Yes | Present number |
| `''` | Yes | Present string |
| `false` | Yes | Present boolean |
| `[]` | Yes | Present array |
| `'hello'` | Yes | Present string |

The built-in rule is simple: only `null` and `undefined` are empty.

## Override With `isEmpty`

Many forms use `''` or `[]` as their cleared state. Add `isEmpty` when those values should count as empty.

```ts
const ump = umpire({
  fields: {
    startTime: {
      isEmpty: (value) => value == null || value === '',
    },
    weekdays: {
      isEmpty: (value) => !Array.isArray(value) || value.length === 0,
    },
    isAllDay: {},
    flexibilityMinutes: {},
  },
  rules: [],
})
```

If you use the common built-ins often, `@umpire/core` also exports shorthand helpers:

```ts
import {
  isEmptyArray,
  isEmptyBigInt,
  isEmptyBoolean,
  isEmptyNumber,
  isEmptyObject,
  isEmptyString,
} from '@umpire/core'

const ump = umpire({
  fields: {
    startTime: { isEmpty: isEmptyString },
    weekdays: { isEmpty: isEmptyArray },
    shippingAddress: { isEmpty: isEmptyObject },
    quantity: { isEmpty: isEmptyNumber },
    flags: { isEmpty: isEmptyBigInt },
    active: { isEmpty: isEmptyBoolean },
  },
  rules: [],
})
```

Those are just convenience functions for the most common cases. Use an inline function when your empty state is domain-specific.

In that configuration:

- `startTime: ''` is empty.
- `weekdays: []` is empty.
- `isAllDay: false` is still satisfied.
- `flexibilityMinutes: 0` is still satisfied.

## Which Rules Check What

| Rule shape | Checks value satisfaction? | Checks dependency availability? |
| --- | --- | --- |
| `requires('field', 'dep')` | Yes | Yes |
| `requires('field', predicate)` | Predicate decides | No |
| `disables('source', targets)` | Yes | No |
| `disables(predicate, targets)` | Predicate decides | No |
| `oneOf(group, branches)` | Yes | No |

That split is deliberate.

- `requires()` with a field-name dependency waits for the dependency to be both satisfied and enabled.
- `disables()` only looks at whether the source is active. A stale value in a disabled source still disables targets.
- `oneOf()` branch detection only looks at values. A stale value can still keep a branch active until you clear it.

## `play()` Uses The Same Empty Rules

Reset recommendations only appear when the now-disabled field still holds a non-empty value. `isEmpty` therefore affects both rule evaluation and cleanup behavior.

```ts
const fouls = ump.play(
  { values: { weekdays: [1, 3, 5] } },
  { values: { weekdays: [1, 3, 5], dates: ['2026-04-01'] } },
)
```

If `weekdays` used `isEmpty: (value) => !Array.isArray(value) || value.length === 0`, then clearing it to `[]` is enough for the recommendation to disappear on the next pass.

## Appropriateness

Satisfaction answers "does this field have a value?" A related but separate question is: "is that value still the right selection given what else is in the form?"

A DDR4 RAM kit is a satisfied field — it has a value, it's non-empty. But if the user just switched their motherboard to one that only supports DDR5, the RAM value is no longer appropriate. The field is still enabled, satisfaction hasn't changed. What changed is the relationship between that value and the rest of the form.

`fairWhen` is the rule for declaring appropriateness:

```ts
fairWhen(ramField, (ram, values) =>
  ramTypeFor(ram) === ramTypeFor(values.motherboard ?? ''), {
  reason: 'RAM type no longer matches the selected motherboard',
})
```

The three levels, in order:

| Level | Question | Governed by |
| --- | --- | --- |
| Present | `value != null`? | — |
| Satisfied | Is it a meaningful value? | `isEmpty`, `isSatisfied` |
| Appropriate | Is it still the right selection? | `fairWhen` |

`fairWhen` only evaluates when the field is already satisfied. There is no notion of appropriateness for an empty field. `check()` reports `fair: true` whenever the field has no value.

`play()` surfaces an inappropriate value as a foul — same format as an availability foul, same convergence property.

See [`fairWhen()`](/api/rules/fair-when/) for the full rule reference.

## Use Presence First, Validation Second

If you need "present and valid", compose those ideas explicitly.

```ts
import { check, enabledWhen, requires, umpire } from '@umpire/core'

const loginUmp = umpire({
  fields: {
    email: { required: true, isEmpty: (value) => !value },
    password: { required: true, isEmpty: (value) => !value },
    submit: { required: true },
  },
  rules: [
    requires('submit', 'password'),
    enabledWhen('submit', check('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/), {
      reason: 'Enter a valid email address',
    }),
  ],
})
```

`requires()` handles presence. `check()` bridges into richer validation logic when you need it.

For full validation composition — building dynamic Zod schemas from availability, filtering errors to enabled fields, gating submit on both layers — see the [Signup Form + Zod](/examples/signup/) example and the [`@umpire/zod`](/adapters/validation/zod/) integration.
