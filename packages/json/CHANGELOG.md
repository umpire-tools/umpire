# @umpire/json

## 1.0.0

### Minor Changes

- e8c048d: Move the pure expression/compiler public surface to `@umpire/dsl` and keep `@umpire/json` focused on `expr.check()`, named validators, and JSON-aware builders.
- eaa06aa: Add safe JSON hydration APIs for untrusted input via `parseJsonSchema(raw)` and `fromJsonSafe(raw)`, returning `{ ok, ... }` results instead of requiring try/catch at call sites.

  This keeps trusted-schema `fromJson(schema)` behavior unchanged while reducing userland casts and improving boundary validation ergonomics.

### Patch Changes

- fee01cf: code formatting & type adjustments for better consistency
- 82fdd4b: Clean up duplicated internals across adapters and JSON tooling by sharing guards, JSON clone helpers, and store previous-state tracking, while simplifying reactive and snapshot plumbing.

  Also tighten package metadata by marking `react` as an optional peer for `@umpire/devtools`.

- d7ddbed: Replace `NamedCheck<any>` return types with `NamedCheck<unknown>` in json validator hydration helpers to avoid unsafe `any` widening for consumers.
- 39be228: Update the JSON conformance snapshots and signals reactive tests to cover the new `satisfied` field status so branch behavior and fixtures stay in sync.
- 4d8bd6c: adjusted publishing setup for `.claude` rules (i don't even honestly know if this kind of thing works. hopefully it's helpful!)
- 6060d47: Standardize error message prefixes to [@umpire/package] format for consistency and searchability across all packages.
- Updated dependencies [135e347]
- Updated dependencies [5b6ab7d]
- Updated dependencies [39be228]
- Updated dependencies [9bc562b]
- Updated dependencies [86280aa]
- Updated dependencies [fee01cf]
- Updated dependencies [82fdd4b]
- Updated dependencies [4eecbeb]
- Updated dependencies [4d8bd6c]
- Updated dependencies [7fb75bf]
- Updated dependencies [aad8d17]
- Updated dependencies [e8c048d]
- Updated dependencies [0904040]
- Updated dependencies [31bc71c]
- Updated dependencies [6060d47]
- Updated dependencies [17dea80]
- Updated dependencies [bff4c43]
- Updated dependencies [19fdbfe]
- Updated dependencies [8eaa826]
- Updated dependencies [17bd119]
  - @umpire/core@1.0.0
  - @umpire/dsl@1.0.0

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
  - @umpire/core@1.0.0

## 0.1.0-alpha.9

### Minor Changes

- Initial release: portable JSON authoring layer
- Field-bound JSON checks — run umpire rules against JSON structure
- DSL for JSON conformance rules (inclusion, exclusion, type, shape)
- Conservative JSON serialization with exclusion deduplication
- Public rule inspection helpers
- Shared emptiness helpers
- Conformance fixture suite and test coverage
