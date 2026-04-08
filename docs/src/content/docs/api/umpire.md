---
title: umpire()
description: Create an Umpire instance from field definitions and rules.
---

`umpire()` is the factory that turns field definitions plus rules into a reusable availability engine.

## Signature

```ts
import type { FieldDef, Rule, Umpire } from '@umpire/core'

function umpire<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(config: {
  fields: F
  rules: Rule<F, C>[]
}): Umpire<F, C>
```

## Config

```ts
type FieldDef = {
  required?: boolean
  default?: unknown
  isEmpty?: (value: unknown) => boolean
}
```

`fields` defines the field names and per-field behavior:

- `required` marks the field as required when enabled.
- `default` seeds `init()` and becomes the `suggestedValue` for `play()`.
- `isEmpty` overrides the default presence check.

`rules` is an ordered array of rule objects returned by helpers like `enabledWhen()`, `requires()`, `disables()`, `oneOf()`, and `anyOf()`.

## Creation-Time Work

`umpire()` does structural work once:

1. Validates referenced field names.
2. Validates `oneOf()` branches, including unknown fields and invalid static `activeBranch` values.
3. Builds the structural dependency graph.
4. Detects cycles in ordering edges.
5. Computes the topological field order used by `check()` and `play()`.
6. Detects structurally contradictory rules that would make a field permanently unreachable.

If any of these checks fail, creation throws immediately rather than leaving the issue for runtime evaluation.

### Structural contradiction detection

Two patterns are caught at construction time:

**`disables` + `requires` on the same pair:**

```ts
// throws: "delta" can never be enabled — it requires "beta" but is disabled whenever "beta" is satisfied
umpire({
  fields: { beta: {}, delta: {} },
  rules: [
    disables('beta', ['delta']),
    requires('delta', 'beta'),
  ],
})
```

**Cross-branch `requires` inside a static `oneOf`:**

```ts
// throws: "alpha" can never be enabled — it requires "beta", but oneOf("strategy") places them in different branches
umpire({
  fields: { alpha: {}, beta: {} },
  rules: [
    oneOf('strategy', { first: ['alpha'], second: ['beta'] }),
    requires('alpha', check('beta', (v) => v === 'ready')),
  ],
})
```

If `oneOf` uses a dynamic `activeBranch` function, cross-branch `requires` is allowed — the contradiction can't be proven statically.

## Return Type

```ts
interface Umpire<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> {
  check(values: InputValues, conditions?: C, prev?: InputValues): AvailabilityMap<F>
  play(before: Snapshot<F, C>, after: Snapshot<F, C>): Foul<F>[]
  init(overrides?: InputValues): FieldValues<F>
  challenge(
    field: keyof F & string,
    values: InputValues,
    conditions?: C,
    prev?: InputValues,
  ): ChallengeTrace
  graph(): {
    nodes: string[]
    edges: Array<{ from: string; to: string; type: string }>
  }
}
```

## Example

```ts
import { enabledWhen, requires, umpire } from '@umpire/core'

const fields = {
  plan: {},
  companyName: {},
  companySize: {},
}

type Conditions = {
  plan: 'personal' | 'business'
}

const signupUmp = umpire<typeof fields, Conditions>({
  fields,
  rules: [
    enabledWhen('companyName', (_values, conditions) => conditions.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_values, conditions) => conditions.plan === 'business', {
      reason: 'business plan required',
    }),
    requires('companySize', 'companyName'),
  ],
})
```

## Notes

- Field names are strongly typed throughout rule declarations and availability results.
- Field values remain `unknown` by design. Narrow them in predicates or your own state layer.
- `graph()` exports the structural graph and is useful for debugging, visualizers, or tests.
