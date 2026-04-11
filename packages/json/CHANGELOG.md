# @umpire/json

## 0.1.0

### Patch Changes

- c1b3da0: - `@umpire/json` now supports top-level `validators` in the portable schema for field-local validation metadata.
  - `fromJson()` now returns `{ fields, rules, validators }` so parsed schemas can feed portable validators straight into `umpire()`.
  - `toJson()` now accepts `validators` and serializes portable validators from `namedValidators.*()` into the JSON `validators` section.
  - `@umpire/json` now exposes `namedValidators.*()` and validator-first type names such as `JsonValidatorOp` and `JsonValidatorSpec`.
  - `@umpire/json` keeps `expr.check()` for structural predicates and preserves top-level `"check"` rules as the legacy structural compatibility form.

## 0.1.0-alpha.9

### Minor Changes

- Initial release: portable JSON authoring layer
- Field-bound JSON checks — run umpire rules against JSON structure
- DSL for JSON conformance rules (inclusion, exclusion, type, shape)
- Conservative JSON serialization with exclusion deduplication
- Public rule inspection helpers
- Shared emptiness helpers
- Conformance fixture suite and test coverage
