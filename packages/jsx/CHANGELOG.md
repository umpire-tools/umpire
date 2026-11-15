# @umpire/jsx

## 1.1.0

### Minor Changes

- 8d55445: Add the `contains` expression op for array-valued fields. `expr.contains(field, value)` (and `<Requires contains={value}>` in `@umpire/jsx`) is true when the field's value is an array holding an element equal to `value`; any non-array value is `false`. Membership ops keep JSON equality with no coercion, so `true` is not `1` and `"22"` is not `22`.

  `@umpire/dsl` gains an optional `fieldIsEmpty` option on `compileExpr`, a map of each field's `isEmpty` function. Membership ops are checked against it at compile time: `in`, `notIn`, or `fieldInCond` on a field whose strategy is `isEmptyArray` throws `"<op>" requires a scalar field` (for example `"notIn" requires a scalar field`), and `contains` on a field whose strategy is `isEmptyString`, `isEmptyNumber`, `isEmptyBoolean`, `isEmptyBigInt`, or `isEmptyObject` throws `"contains" requires an array field`. The check is by function identity, so a custom `isEmpty` function or `isEmptyPresent` is not checked.

  `@umpire/json` builds that map from each field's declared `isEmpty` strategy, so schema validation rejects a contradictory membership expression in every expression position at any depth. `@umpire/jsx` builds it from each field's `isEmpty` prop, so `<Requires contains>` on a field declared `isEmpty={isEmptyString}` throws instead of compiling a predicate that is always false.

  Behavior change: `fromJson`, `fromJsonSafe`, `parseJsonSchema`, and `toJson()` now throw on these documents, which the previous release accepted. A config that pairs `field().isEmpty(isEmptyArray)` with `expr.in(...)` on that field now fails to serialize. That `in` never matched an array value at runtime, so the rule it expressed never fired.

  Aligns with umpire-spec v1.2.0 (V1-13). `@umpire/core` exports the `IsEmptyFn` type for the new option, plus `getFieldBuilderDef`, which an adapter holding a `field()` builder can use to read back the definition that builder has accumulated.

### Patch Changes

- Updated dependencies [8d55445]
  - @umpire/core@1.1.1
  - @umpire/dsl@1.1.0

## 1.0.0

### Minor Changes

- 2d3bd31: Adds value-conditional `<Requires>` props (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `truthy`, `falsy`) and `when` escape hatch for raw DSL expressions, powered by `@umpire/dsl`. Adds `<FairWhen>` for field-level value validation, top-level `<StandaloneDisables>` and `<OneOf>` components, and `reason` prop support on all rule components.

### Patch Changes

- Updated dependencies [7f036c2]
- Updated dependencies [102318e]
- Updated dependencies [c52a2e8]
- Updated dependencies [e15a298]
  - @umpire/core@1.1.0
  - @umpire/dsl@1.0.1
