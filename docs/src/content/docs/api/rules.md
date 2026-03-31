---
title: Rule Primitives
description: The built-in rule helpers for composing field availability.
---

# Rule Primitives

Every rule helper returns a `Rule<F, C>` object. Rules are plain values, so they can be composed, stored, and combined with `anyOf()`.

## `enabledWhen(field, predicate, options?)`

```ts
enabledWhen(
  field,
  (values, conditions) => boolean,
  {
    reason?: string | ((values, conditions) => string)
  },
)
```

Enables a field only when the predicate returns `true`.

```ts
enabledWhen('companyName', (_values, conditions) => conditions.plan === 'business', {
  reason: 'business plan required',
})
```

Default failure reason: `"condition not met"`.

## `disables(source, targets, options?)`

```ts
disables(
  source,
  ['targetA', 'targetB'],
  {
    reason?: string | ((values, conditions) => string)
  },
)
```

`source` can be:

- a field name
- a predicate `(values, conditions) => boolean`
- a `check(field, validator)` helper

If the source is active, the targets are disabled.

```ts
disables('dates', ['everyWeekday', 'everyDate', 'everyMonth'])
```

Default failure reason:

- `"overridden by dates"` for a field-name source
- `"overridden by condition"` for a predicate source without preserved field metadata

## `requires(field, ...deps)`

```ts
requires(
  field,
  ...deps,
)
```

Dependencies can be:

- field names
- predicates
- `check(field, validator)` helpers

An optional final object is treated as rule options:

```ts
requires('submit', 'password', {
  reason: 'Password required before submit',
})
```

Important behavior:

- Field-name dependencies check both value satisfaction and dependency availability.
- Predicate dependencies only check the predicate result.
- Multiple dependencies are ANDed together.

```ts
requires('repeatEvery', 'startTime')
requires('submit', check('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/))
requires('endTime', ({ startTime }) => typeof startTime === 'string' && startTime.length > 0)
```

Default failure reason:

- `"requires fieldName"` for field-name dependencies
- `"required condition not met"` for predicate dependencies

## `oneOf(groupName, branches, options?)`

```ts
oneOf(
  'subDayStrategy',
  {
    hourList: ['everyHour'],
    interval: ['startTime', 'endTime', 'repeatEvery'],
  },
  {
    reason?: string | ((values, conditions) => string)
    activeBranch?: string | ((values, conditions) => string | null | undefined)
  },
)
```

Only one branch stays enabled at a time.

Branch resolution is:

1. Explicit static `activeBranch`, if provided.
2. Explicit function `activeBranch(values, conditions)`, if provided.
3. Auto-detection from satisfied fields.
4. `prev`-assisted resolution when multiple branches are satisfied.
5. First satisfied branch as a fallback, with a development warning.

Default failure reason: `"conflicts with <branch> strategy"`.

Creation-time validation rejects:

- empty branches
- overlapping fields across branches
- invalid static `activeBranch`
- unknown field names

## `anyOf(...rules)`

```ts
anyOf(ruleA, ruleB, ruleC)
```

Wraps multiple rules and passes if any inner rule passes.

All inner rules must target the same fields, or creation throws.

```ts
anyOf(
  enabledWhen('submit', ({ password }) => !!password, {
    reason: 'Enter a password',
  }),
  enabledWhen('submit', (_values, conditions) => conditions.bypass === true, {
    reason: 'Bypass flag missing',
  }),
)
```

## `check(field, validator)`

```ts
check(field, validator)
```

Returns a predicate with preserved field metadata, so it works naturally inside `enabledWhen()`, `requires()`, or `disables()`.

Supported validators:

- `(value: unknown) => boolean`
- `{ safeParse(value): { success: boolean } }`
- `{ test(value): boolean }`, including `RegExp`

```ts
enabledWhen('submit', check('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/), {
  reason: 'Enter a valid email address',
})
```

Because `check()` preserves the field name internally, the graph can still understand it as depending on `email`.

## Custom Reasons

All rule helpers that accept `options.reason` support either a static string or a function.

```ts
enabledWhen('companyName', (_values, conditions) => conditions.plan === 'business', {
  reason: (_values, conditions) => `Plan "${conditions.plan}" cannot edit company details`,
})
```

Dynamic reasons are useful when the UI should explain a specific plan tier, feature flag, or external gate.
