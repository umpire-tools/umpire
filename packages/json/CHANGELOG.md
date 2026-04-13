# @umpire/json

## 0.1.0-alpha.10

### Minor Changes

- f073d78: - Add portable JSON schema support for `eitherOf()` via `{ type: "eitherOf", group, branches }`.
  - Add `eitherOfJson(groupName, branches)` and expose it through `createJsonRules()` for JSON-authored named OR paths.
  - `fromJson()`, `toJson()`, and `validateSchema()` now understand `eitherOf()` and preserve the same branch-shape invariants as core.
  - `validateSchema()` now rejects malformed `anyOf()` and `eitherOf()` composites earlier instead of deferring those errors to hydration.
  - Add conformance coverage for `eitherOf()` auth-path flows in the JSON fixture suite.

### Patch Changes

- 4cb7aed: Ship the `conformance/` directory with the published package so external ports (Kotlin, Python, Dart, etc.) can consume the cross-runtime fixtures without cloning the repo. Adds `conformance/index.json` as a discovery manifest and a language-neutral pseudocode runner guide to `conformance/README.md`.
- c1b3da0: - `@umpire/json` now supports top-level `validators` in the portable schema for field-local validation metadata.
  - `fromJson()` now returns `{ fields, rules, validators }` so parsed schemas can feed portable validators straight into `umpire()`.
  - `toJson()` now accepts `validators` and serializes portable validators from `namedValidators.*()` into the JSON `validators` section.
  - `@umpire/json` now exposes `namedValidators.*()` and validator-first type names such as `JsonValidatorOp` and `JsonValidatorSpec`.
  - `@umpire/json` keeps `expr.check()` for structural predicates and preserves top-level `"check"` rules as the legacy structural compatibility form.
- Updated dependencies [e570cac]
- Updated dependencies [73cd485]
- Updated dependencies [1fcfe46]
  - @umpire/core@0.1.0

## 0.1.0-alpha.9

### Minor Changes

- Initial release: portable JSON authoring layer
- Field-bound JSON checks — run umpire rules against JSON structure
- DSL for JSON conformance rules (inclusion, exclusion, type, shape)
- Conservative JSON serialization with exclusion deduplication
- Public rule inspection helpers
- Shared emptiness helpers
- Conformance fixture suite and test coverage
