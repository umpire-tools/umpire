---
title: fairWhen()
description: Mark a field's current value as no longer appropriate when a predicate returns false.
---

Declares when a field's current value is appropriate. If the predicate returns `false` on a non-empty value, `check()` reports `fair: false` for that field and `play()` recommends a reset.

Unlike `enabledWhen()`, `fairWhen()` does not disable the field. The field stays available — it just carries a value that no longer fits the current form state.

## Signature

```ts
fairWhen(
  field,
  (value, values, conditions) => boolean,
  {
    reason?: string | ((values, conditions) => string)
  },
)
```

The first argument can be a field name string or a named [`field<V>()`](/api/field/) builder. Using a named builder gives the predicate a typed `value` parameter instead of `unknown`.

## Example

```ts
import { fairWhen, field, umpire, requires } from '@umpire/core'

const cpuField = field<string>('cpu')
const motherboardField = field<string>('motherboard')
const ramField = field<string>('ram')

const pcUmp = umpire({
  fields: {
    cpu: cpuField.required().isEmpty((v) => !v),
    motherboard: motherboardField.required().isEmpty((v) => !v),
    ram: ramField.required().isEmpty((v) => !v),
  },
  rules: [
    requires('motherboard', 'cpu', { reason: 'Pick a CPU first' }),
    fairWhen(motherboardField, (mb, values) =>
      socketFor(mb) === socketFor(values.cpu ?? ''), {
      reason: 'Motherboard socket no longer matches the selected CPU',
    }),
    requires('ram', 'motherboard', { reason: 'Pick a motherboard first' }),
    fairWhen(ramField, (ram, values) =>
      ramTypeFor(ram) === ramTypeFor(values.motherboard ?? ''), {
      reason: 'RAM type no longer matches the selected motherboard',
    }),
  ],
})
```

When the user switches their CPU to a different socket, `motherboard` and `ram` both remain enabled — but `play()` recommends clearing them because their values are no longer appropriate.

## When the predicate runs

`fairWhen` only evaluates the predicate when the field is **satisfied** — when `isSatisfied(value, fieldDef)` returns true. If the field has no value, the predicate is skipped and `fair` is reported as `true`.

This means predicate authors never need to guard against empty values:

```ts
// No null check needed — the predicate only runs when ram has a value
fairWhen(ramField, (ram, values) =>
  ramTypeFor(ram) === ramTypeFor(values.motherboard ?? ''))
```

## Cascade behavior

An unfair field is treated as unsatisfied for downstream `requires` chains. If `motherboard` becomes unfair, any field that `requires('ram', 'motherboard')` will see its dependency as absent — and become disabled — without any additional rules.

One `fairWhen` on a root field propagates through the existing dependency graph automatically.

## `play()` and fouls

`play()` produces a foul when:

- A field transitions from `fair: true` to `fair: false` between the `before` and `after` snapshots, **and**
- The field's current value is non-empty

The foul `reason` comes from the `fairWhen` options. `suggestedValue` follows the same logic as availability fouls: `FieldDef.default` if defined, `undefined` otherwise.

## Default reason

`"value no longer appropriate"`

## Using a plain string instead of a field builder

When you pass a field name string, the predicate receives `value: unknown` and you'll need to cast if you want type safety:

```ts
fairWhen('motherboard', (mb, values) =>
  socketFor(mb as string) === socketFor(values.cpu as string ?? ''))
```

For typed predicates without repetition, use [`field<V>()`](/api/field/) or the chained builder form:

```ts
const fields = {
  motherboard: field<string>('motherboard')
    .required()
    .isEmpty((v) => !v)
    .fairWhen((mb, values) => socketFor(mb) === socketFor(values.cpu ?? ''), {
      reason: 'Motherboard socket no longer matches the selected CPU',
    }),
}
```

## See also

- [`field<V>()`](/api/field/) — typed field builder, named form for top-level rules
- [Field Appropriateness](/concepts/satisfaction/#appropriateness) — the three-level model: present, satisfied, appropriate
- [`play()`](/api/play/) — how fairness fouls surface as reset recommendations
- [`enabledWhen()`](/api/rules/enabled-when/) — for gating availability, not value appropriateness
