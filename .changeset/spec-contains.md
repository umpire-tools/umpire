---
"@umpire/dsl": minor
"@umpire/json": minor
"@umpire/jsx": minor
---

Add the `contains` expression op for array-valued fields. `expr.contains(field, value)` (and `<Requires contains={value}>` in `@umpire/jsx`) is true when the field's value is an array holding an element equal to `value`; any non-array value is `false`. Membership ops keep JSON equality with no coercion, so `true` is not `1` and `"22"` is not `22`.

`@umpire/json` now rejects membership expressions that contradict a field's declared `isEmpty` strategy at schema validation: `in`, `notIn`, or `fieldInCond` on an `"isEmpty": "array"` field reports `"<op>" requires a scalar field` (for example `"notIn" requires a scalar field`), and `contains` on a field declared `"isEmpty"` as `string`, `number`, `boolean`, or `object` reports `"contains" requires an array field`. The check covers every expression position at any depth.

Behavior change: `fromJson`, `fromJsonSafe`, `parseJsonSchema`, and `toJson()` now throw on these documents, which the previous release accepted. A config that pairs `field().isEmpty(isEmptyArray)` with `expr.in(...)` on that field now fails to serialize. That `in` never matched an array value at runtime, so the rule it expressed never fired.

Aligns with umpire-spec v1.2.0-rc.1 (V1-13).
