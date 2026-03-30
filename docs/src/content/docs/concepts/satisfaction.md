---
title: Field Satisfaction Semantics
description: Understand the default presence-based model and when to override it with isEmpty.
---

# Field Satisfaction Semantics

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

## `flag()` Uses The Same Empty Rules

Reset recommendations only appear when the now-disabled field still holds a non-empty value. `isEmpty` therefore affects both rule evaluation and cleanup behavior.

```ts
const penalties = ump.flag(
  { values: { weekdays: [1, 3, 5] } },
  { values: { weekdays: [1, 3, 5], dates: ['2026-04-01'] } },
)
```

If `weekdays` used `isEmpty: (value) => !Array.isArray(value) || value.length === 0`, then clearing it to `[]` is enough for the recommendation to disappear on the next pass.

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
