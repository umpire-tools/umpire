---
title: field<V>()
description: A typed field declaration helper that enables typed fairWhen predicates and optional curried rule chaining.
---

`field<V>()` is a field declaration helper. Its main job is capturing the value type `V` so that `fairWhen` predicates receive a typed `value` parameter instead of `unknown`. It also supports a curried builder style as an alternative to plain object declarations.

For common empty-state rules, `@umpire/core` exports helpers such as `isEmptyString`, `isEmptyArray`, and `isEmptyObject`, so you do not have to repeat the same inline `isEmpty` functions everywhere.

## Two forms

### Anonymous — inside `umpire()`

```ts
const ump = umpire({
  fields: {
    motherboard: field<string>().required().isEmpty((v) => !v),
  },
  rules: [],
})
```

The field name is inferred from the object key. Anonymous builders cannot be passed to top-level rule functions.

### Named — for top-level rule references

```ts
const motherboard = field<string>('motherboard').required().isEmpty((v) => !v)

const ump = umpire({
  fields: { motherboard },
  rules: [
    fairWhen(motherboard, (mb, values) =>
      socketFor(mb) === socketFor(values.cpu ?? '')),
  ],
})
```

The name is baked into the builder and extracted by rule factories. Rules receive a typed `value: NonNullable<V>` parameter.

Named builders work anywhere field names are accepted — as targets in top-level rules, and in `requires()`, `disables()`, and `oneOf()`.

When a named builder is used as an object key in `umpire()`, the provided name must match the key. Mismatches throw at construction time.

## Builder API

```ts
interface FieldBuilder<V> {
  required(): this
  default(value: V): this
  isEmpty(fn: (value: V | null | undefined) => boolean): this

  // Attach rules — extracted by umpire() into the rules array
  fairWhen(
    predicate: (value: NonNullable<V>, values, conditions) => boolean,
    options?: { reason?: string | ((values, conditions) => string) },
  ): this
  enabledWhen(
    predicate: (values, conditions) => boolean,
    options?: { reason?: string | ((values, conditions) => string) },
  ): this
  requires(
    dependency: string | FieldBuilder<unknown>,
    options?: { reason?: string },
  ): this
}
```

Chained rules are semantically identical to rules in the top-level `rules` array — `umpire()` extracts them at construction time.

## Backward compatibility

`field<V>()` results and plain `FieldDef` objects are interchangeable. Existing declarations are unaffected:

```ts
// These three are equivalent
const fields = {
  email: { required: true, isEmpty: (v) => !v },
  email: field().required().isEmpty((v) => !v),
  email: field<string>().required().isEmpty((v) => !v),
}
```

The plain object form has no value type — predicates receive `value: unknown` when a plain object is passed to `fairWhen`. Use `field<V>()` when you want typed predicates.

## Why `NonNullable<V>`

`fairWhen` only runs its predicate when the field is satisfied. Umpire guarantees the value is non-null and non-undefined before calling the predicate, so `NonNullable<V>` is the correct signature. No null guards needed inside the predicate.

## See also

- [`fairWhen()`](/api/rules/fair-when/) — the rule that benefits most from typed field builders
- [Field Appropriateness](/concepts/satisfaction/#appropriateness) — why the type matters for predicate authoring
