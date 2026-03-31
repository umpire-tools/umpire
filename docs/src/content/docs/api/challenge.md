---
title: ump.challenge()
description: Inspect why a field is enabled or disabled, including direct failures, transitive dependencies, and oneOf resolution.
---

# `ump.challenge()`

`challenge()` is the debug view of the availability engine. It is meant for development, tests, and tooling, not for rendering directly in a production UI.

## Signature

```ts
ump.challenge(
  field: keyof F & string,
  values: FieldValues<F>,
  conditions?: C,
  prev?: FieldValues<F>,
): ChallengeTrace
```

## Return Shape

```ts
type ChallengeTrace = {
  field: string
  enabled: boolean
  directReasons: Array<{
    rule: string
    reason: string | null
    passed: boolean
    [key: string]: unknown
  }>
  transitiveDeps: Array<{
    field: string
    enabled: boolean
    reason: string | null
    causedBy: Array<{ rule: string; [key: string]: unknown }>
  }>
  oneOfResolution: {
    group: string
    activeBranch: string | null
    method: string
    branches: Record<string, { fields: string[]; anySatisfied: boolean }>
  } | null
}
```

## `directReasons`

`directReasons` includes every rule targeting the field, whether it passed or failed.

Rule-specific metadata is attached where possible:

- `enabledWhen` includes the predicate source string.
- `disables` includes the source description and source value.
- `requires` includes dependency satisfaction details.
- `oneOf` includes the group, winning branch, and current field branch.
- `anyOf` nests inner rule traces.

## `transitiveDeps`

When a field is blocked by a `requires()` chain, `transitiveDeps` walks upstream to the fields that caused the dependency to fail.

In the current implementation this is a flat array of discovered upstream fields, each with a `causedBy` array describing the failing rules on that dependency.

## `oneOfResolution`

If the field belongs to a `oneOf()` group, `oneOfResolution` shows:

- the group name
- the active branch
- the resolution method
- the satisfaction status of every branch

That makes ambiguous branch selection much easier to inspect.

## Example

```ts
const trace = recurrenceUmp.challenge(
  'everyHour',
  { everyHour: [9, 17], startTime: '09:00' },
  undefined,
  { everyHour: [9, 17] },
)
```

```ts
trace.oneOfResolution
// {
//   group: 'subDayStrategy',
//   activeBranch: 'interval',
//   method: 'auto-detected from prev',
//   branches: {
//     hourList: { fields: ['everyHour'], anySatisfied: true },
//     interval: { fields: ['startTime', 'endTime', 'repeatEvery'], anySatisfied: true },
//   },
// }
```

## Console Usage

```ts
if (!result.submit.enabled) {
  console.table(loginUmp.challenge('submit', values, conditions).directReasons)
}
```

## Notes

- `challenge()` reuses the same `prev` semantics as `check()`, so `oneOf()` debugging stays faithful to live resolution.
- It throws if you challenge an unknown field.
- Because it gathers extra trace detail, it is more expensive than `check()`.
