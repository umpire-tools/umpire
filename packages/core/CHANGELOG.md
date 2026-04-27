# @umpire/core

## 1.0.0

### Minor Changes

- 86280aa: `isEqual` now also supports left-hand `equals(other)` dispatch in addition to `fantasy-land/equals` and `Object.is` identity checks, with behavior intentionally scoped for change detection.
- 82fdd4b: Clean up duplicated internals across adapters and JSON tooling by sharing guards, JSON clone helpers, and store previous-state tracking, while simplifying reactive and snapshot plumbing.

  Also tighten package metadata by marking `react` as an optional peer for `@umpire/devtools`.

- 4eecbeb: Loosen `InputValues` from a generic `FieldValues<F>` alias to `Record<string, unknown>`. Consumer call sites (`check()`, `play()`, `useUmpire()`, adapters) no longer require casts when passing form state or dynamic records. Predicate callbacks keep `FieldValues<F>` for typed field access. Remove phantom `F` parameter from `Snapshot` — only `C` (conditions) is structurally used.
- 31bc71c: Remove unused `V` type parameter from `FieldSelector<F>` and the function signatures that accepted it (`enabledWhen`, `requires`, `disables`). The parameter was never referenced in the type body and had no effect on type checking. `fairWhen` retains its `V` parameter for use with `FairPredicate<V, F, C>`.
- 17dea80: Add a first-class `strike(values, fouls)` helper for applying foul suggestions to values in one pure operation.

  `strike` now preserves referential stability by returning the original values object when there are no fouls or when all suggestions are already applied.

- 19fdbfe: Add core rule attribution metadata and testing coverage tracking.

  `@umpire/core` now exposes `ump.rules()` with normalized rule entries and includes `ruleId`/`ruleIndex` on challenge reasons. `@umpire/testing` adds `trackCoverage()` to report observed field states and uncovered rule activations from instrumented `check()` and `scorecard()` calls.

- 17bd119: removed scorecard wrapper function, not necessary and required an `ump` instance anyway

### Patch Changes

- 135e347: adds mutation-test driven tests to lock in behaviour
- 5b6ab7d: Consolidate duplicated `getFieldNameOrThrow` into a single export from `field.ts`
- 39be228: Expose field satisfaction on `check()` field status so consumers can read `satisfied` alongside enabled/fair/required metadata.
- 9bc562b: Export snapshotValue from core; use in Solid to prevent circular-reference stack-overflow
- fee01cf: code formatting & type adjustments for better consistency
- 4d8bd6c: adjusted publishing setup for `.claude` rules (i don't even honestly know if this kind of thing works. hopefully it's helpful!)
- 7fb75bf: Preserve literal branch-name typing for `oneOf(..., { activeBranch })` so `activeBranch` no longer widens to plain `string` at common call sites.

  This improves TypeScript ergonomics by reducing casts when returning known branch keys.

- aad8d17: Trim composite/challenge allocation overhead in core evaluation paths and add multi-run benchmark summaries with variance and construction/runtime totals.
- 0904040: Remove duplicated requires rule evaluation logic from evaluator.ts
- 6060d47: Standardize error message prefixes to [@umpire/package] format for consistency and searchability across all packages.
- bff4c43: Optimize core construction and evaluation hot paths to reduce runtime overhead.
- 8eaa826: more mutation testing and minor refactors for simplification and removing redundancy

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
