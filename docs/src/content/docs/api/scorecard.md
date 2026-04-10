---
title: ump.scorecard()
description: Combine check(), play(), and graph() into a single typed snapshot of field state and transition history.
---

`scorecard()` is the structural inspection surface of an umpire instance. It combines the results of `check()`, `play()`, and `graph()` into one typed object, with per-field state rich enough to drive reset UX, coaching layers, debug panels, and transition-aware tests.

## Signature

```ts
ump.scorecard(
  snapshot: Snapshot<F, C>,
  options?: {
    before?: Snapshot<F, C>
    includeChallenge?: boolean
  },
): ScorecardResult<F, C>
```

Also available as a standalone function:

```ts
import { scorecard } from '@umpire/core'

scorecard(ump, snapshot, options)
```

Both forms return identical results.

## Return Shape

```ts
type ScorecardResult<F, C> = {
  check: AvailabilityMap<F>
  graph: UmpireGraph
  fields: Record<keyof F & string, ScorecardField<F>>
  transition: ScorecardTransition<F, C>
}
```

`check` and `graph` are the same values you would get from `ump.check()` and `ump.graph()` directly. The addition is `fields` — a per-field view that cross-references all of them — and `transition`, which describes what changed.

## Per-Field State

Each entry in `fields` is a `ScorecardField`:

```ts
type ScorecardField<F> = {
  field: keyof F & string
  value: unknown

  // Presence
  present: boolean       // value !== null && value !== undefined
  satisfied: boolean     // present and passes fieldDef.isEmpty (if defined)

  // Availability
  enabled: boolean
  fair: boolean
  required: boolean
  reason: string | null
  reasons: string[]
  valid?: boolean
  error?: string

  // Transition
  changed: boolean       // this field's value differs from before
  cascaded: boolean      // this field fouled because something upstream changed

  // Reset
  foul: Foul<F> | null

  // Graph
  incoming: Array<{ field: string; type: string }>
  outgoing: Array<{ field: string; type: string }>

  // Optional
  trace?: ChallengeTrace
}
```

### `present` vs `satisfied`

These are two distinct concepts.

- `present` is raw JS presence: `value !== null && value !== undefined`.
- `satisfied` additionally respects the field's `isEmpty` definition. An empty array or empty string can be `present` but not `satisfied` if the field definition treats them as empty.

`fair` only applies to fields that are `satisfied`. An unsatisfied field is never `fair` or `unfair` — it simply has no value to judge.

### `changed` vs `cascaded`

Without a `before` snapshot both are always `false`. With one:

- `changed` is `true` when this field's value in the snapshot differs from `before`.
- `cascaded` is `true` when this field received a foul recommendation but the user did not directly change it. The foul arrived because something upstream changed and this field's current value is no longer valid.

A field can have `foul !== null` with `changed: false` and `cascaded: true`. That is the transitive foul case — see [Transition](#transition) below.

## Transition

```ts
type ScorecardTransition<F, C> = {
  before: Snapshot<F, C> | null
  changedFields: Array<keyof F & string>
  fouls: Foul<F>[]
  foulsByField: Partial<Record<keyof F & string, Foul<F>>>
  fouledFields: Array<keyof F & string>
  directlyFouledFields: Array<keyof F & string>
  cascadingFields: Array<keyof F & string>
}
```

Without a `before` snapshot, `changedFields`, `fouls`, and all derived arrays are empty.

### `directlyFouledFields` vs `cascadingFields`

This is the main reason to reach for `scorecard()` over calling `play()` directly.

`directlyFouledFields` — fields the user changed that now hold a foul value.

`cascadingFields` — fields the user did not touch, but which fouled because a field they depend on changed.

**Example:** A PC configurator has rules `requires('motherboard', 'cpu')` and `requires('ram', 'motherboard')`. The user switches from an Intel CPU to an AMD CPU.

- `motherboard` is directly fouled — the socket no longer matches the new CPU.
- `ram` is a cascading field — the user never touched it, but it now holds a DDR4 kit that the new AMD board (DDR5) rejects. The foul traveled down the dependency chain.

```ts
const result = pcUmp.scorecard(after, { before })

result.transition.changedFields
// ['cpu']

result.transition.directlyFouledFields
// ['motherboard']

result.transition.cascadingFields
// ['ram']
```

`foulsByField` provides the same `Foul` records as `play()` but keyed by field name for direct access without `.find()`.

## `includeChallenge`

By default, `ScorecardField.trace` is `undefined` and `challenge()` is never called. Set `includeChallenge: true` to include a full `ChallengeTrace` for every field:

```ts
const result = ump.scorecard(snapshot, {
  before,
  includeChallenge: true,
})

result.fields.motherboard.trace
// ChallengeTrace — same shape as ump.challenge('motherboard', ...)
```

Keep this off in production render paths. It runs a full `challenge()` call per field, which is more expensive than the default path. It is appropriate for dev tools, debug panels, and test assertions.

See [`ump.challenge()`](/api/challenge) for the trace shape.

## Example

```ts
const pcUmp = umpire({
  fields: {
    cpu:         { required: true, isEmpty: (v) => !v },
    motherboard: { required: true, isEmpty: (v) => !v },
    ram:         { required: true, isEmpty: (v) => !v },
  },
  rules: [
    requires('motherboard', 'cpu'),
    fairWhen('motherboard', (_v, values) => socketMatches(values)),
    requires('ram', 'motherboard'),
    fairWhen('ram', (_v, values) => ramTypeMatches(values)),
  ],
})

const before = {
  values: { cpu: 'intel-i7', motherboard: 'asus-z790', ram: 'ddr5-32' },
}

const after = {
  values: { cpu: 'amd-r7', motherboard: 'asus-z790', ram: 'ddr5-32' },
}

const result = pcUmp.scorecard(after, { before })

result.transition.changedFields         // ['cpu']
result.transition.directlyFouledFields  // ['motherboard']
result.transition.cascadingFields       // ['ram']

result.fields.motherboard.changed       // false — user didn't touch it
result.fields.motherboard.cascaded      // false — it's directly fouled, not cascaded
result.fields.motherboard.foul          // Foul { field: 'motherboard', ... }

result.fields.ram.changed               // false
result.fields.ram.cascaded              // true
result.fields.ram.foul                  // Foul { field: 'ram', ... }
```

The `motherboard` field has a foul but is not `cascaded` because it was directly affected by the CPU change — the `fairWhen` rule on `motherboard` reads CPU socket, so motherboard's foul is direct. `ram` is `cascaded` because it depends on `motherboard` via `requires`, and the user never touched it.

## When To Use `scorecard()`

Reach for `scorecard()` when you need to present structure to the user or build tooling around it.

**Reset UX** — `transition.fouls` plus `cascadingFields` is enough to render a banner that distinguishes "you broke this" from "this fell because of that."

**Coaching layers** — The `changed` / `cascaded` / `fair` field state provides the substrate for milestone detection and context-aware hints without a second rule system.

**Debug and developer tooling** — Add `includeChallenge: true` to get full traces for a visual availability debugger.

**Transition-aware tests** — Assert that a specific change produces exactly the expected `directlyFouledFields` and `cascadingFields`, not just that some fouls exist.

For simple availability checks in a hot render path, `ump.check()` is still the right call. `scorecard()` does more work — it calls `check()`, `play()`, and `graph()` together — and is best suited for inspection contexts rather than per-render evaluation.
