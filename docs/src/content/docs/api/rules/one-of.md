---
title: oneOf()
description: Only one branch of fields stays enabled at a time.
---

Mutually exclusive branches — when one branch is active, all other branches' fields are disabled. Use for scheduling strategies, shipping modes, handling types, or any "pick one" pattern.

## Signature

```ts
oneOf(
  groupName,
  {
    branchA: ['fieldX'],
    branchB: ['fieldY', 'fieldZ'],
  },
  {
    reason?: string | ((values, conditions) => string)
    activeBranch?: string | ((values, conditions) => string | null | undefined)
  },
)
```

Branch members can be field names or named field builders. Predicates and `check()` are not supported for branch members — branches need stable field references for mutual exclusion tracking.

## Branch resolution

The active branch is determined by (in order):

1. Explicit static `activeBranch`, if provided.
2. Explicit function `activeBranch(values, conditions)`, if provided.
3. Auto-detection from satisfied fields.
4. `prev`-assisted resolution when multiple branches are satisfied.
5. First satisfied branch as a fallback, with a development warning.

## Example

```ts
oneOf('subDayStrategy', {
  hourList: ['everyHour'],
  interval: ['startTime', 'endTime', 'repeatEvery'],
}, {
  activeBranch: (_v, c) => c.strategy,
  reason: 'select a scheduling strategy',
})
```

## Default reason

`"conflicts with <branch> strategy"`

## Creation-time validation

`oneOf()` rejects at creation time:

- empty branches
- overlapping fields across branches
- invalid static `activeBranch`
- unknown field names

## See also

- [Quick Start: oneOf](/learn/#oneof) — interactive demo
- [Topological Evaluation Order](/concepts/evaluation/) — how branches interact with the dependency graph
