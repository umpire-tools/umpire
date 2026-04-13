# @umpire/core

## 0.1.0-alpha.10

### Minor Changes

- e570cac: Add browser/CDN builds via tsdown

  Both `@umpire/core` and `@umpire/react` now ship bundled browser artifacts alongside the existing ESM build:

  - `dist/index.browser.js` — minified ESM for `<script type="module">` and esm.sh
  - `dist/index.iife.js` — IIFE with `window.Umpire` / `window.UmpireReact` globals

  Both packages now expose a `browser` field and `"browser"` export condition pointing at the ESM build, so bundlers targeting browser environments resolve the right artifact automatically.

  Unpkg / jsDelivr / esm.sh access is automatic — no extra configuration required after publish.

- 1fcfe46: - Add `eitherOf(groupName, branches)`, a new core rule helper for named OR paths where each branch is a group of ANDed rules.
  - `eitherOf()` supports both availability and fairness constraints, validates that inner rules share the same targets and constraint, and allows multiple branches to pass at once.
  - `challenge()` and `inspectRule()` now preserve `eitherOf()` branch structure so named paths are visible in debugging output.
  - `@umpire/devtools` now renders `eitherOf()` branch groups in the challenge drawer so named paths are readable during inspection.

### Patch Changes

- 73cd485: - Add a shared `snapshotValue()` helper at `@umpire/core/snapshot` for cloning previous plain-data snapshots without changing custom-instance comparison semantics.
  - Use shared snapshotting across the React, devtools, signals, Pinia, Vuex, Redux, and TanStack Store integrations so in-place nested plain-object mutations do not rewrite the saved "before" snapshot.

## 0.1.0-alpha.9

### Minor Changes

- Added `NamedCheck` type and metadata support for plugins
- Added `defineRule` escape hatch for custom rule authoring
- Renamed `FieldStatus` (was a core type rename from previous internal name)
- Added structural contradiction detection — `umpire()` now rejects logically impossible rule combinations at init time
- Named builder support in rule references

## 0.1.0-alpha.8

_Version skipped (internal)_

## 0.1.0-alpha.7

### Major Changes

- **`flag()` renamed to `play()`** across all packages and docs — cleaner baseball metaphor, less collision with browser APIs

### Minor Changes

- Hardening pass: edge case coverage, internal consistency improvements
- `@umpire/reads` extracted as standalone package (read-backed rule adapters, scorecard, hints)

## 0.1.0-alpha.6

### Minor Changes

- `foulMap()` utility — get a map of all active fouls keyed by field
- `createRules()` typed rule factory helper for better DX
- `reactive foul()` accessor added alongside `foulMap`
- `challenge()` trace enrichment for `check()` predicates — traces now include predicate metadata
- `enabledWhen` check graph metadata preserved in challenge output

## 0.1.0-alpha.5

### Minor Changes

- **`penalties` renamed to `fouls`** across all packages and docs
- `InputValues` loosened at public API boundaries — permissive inputs accepted, `FieldValues<F>` preserved internally
- `fairWhen` top-level rule added

## 0.1.0-alpha.4

### Minor Changes

- **`context` renamed to `conditions`** across all packages and docs
- Benchmark harness added; baseline timings established

## 0.1.0-alpha.3

### Patch Changes

- `oneOf` `activeBranch` callback now receives context as argument

## 0.1.0-alpha.2

### Minor Changes

- Initial public release
- `umpire()` factory with `flag`/`init`/`graph`
- Topological evaluator with dependency graph and cycle detection
- Rule factories: `enabledWhen`, `requiredWhen`, `oneOf`, `check()`
- `challenge()` introspection API
- `useUmpire` React hook
- Zustand, signals (alien/preact/tc39) adapters
