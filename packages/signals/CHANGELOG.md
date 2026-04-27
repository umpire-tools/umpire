# @umpire/signals

## 1.0.0

### Minor Changes

- bc1ec79: Tighten adapter typing so field and condition keys carry their value types end-to-end.

  `reactiveUmp()` now type-checks external `signals` and `conditions` option entries against the umpire field and condition shapes, and `fromSolidStore()` now requires keyed `values`/`set()` signatures that align with those same field types.

### Patch Changes

- fee01cf: code formatting & type adjustments for better consistency
- 82fdd4b: Clean up duplicated internals across adapters and JSON tooling by sharing guards, JSON clone helpers, and store previous-state tracking, while simplifying reactive and snapshot plumbing.

  Also tighten package metadata by marking `react` as an optional peer for `@umpire/devtools`.

- 4eecbeb: Loosen `InputValues` from a generic `FieldValues<F>` alias to `Record<string, unknown>`. Consumer call sites (`check()`, `play()`, `useUmpire()`, adapters) no longer require casts when passing form state or dynamic records. Predicate callbacks keep `FieldValues<F>` for typed field access. Remove phantom `F` parameter from `Snapshot` — only `C` (conditions) is structurally used.
- 39be228: Update the JSON conformance snapshots and signals reactive tests to cover the new `satisfied` field status so branch behavior and fixtures stay in sync.
- 4d8bd6c: adjusted publishing setup for `.claude` rules (i don't even honestly know if this kind of thing works. hopefully it's helpful!)
- 6060d47: Standardize error message prefixes to [@umpire/package] format for consistency and searchability across all packages.
- 93a34c6: Stabilize optional signal adapter module resolution under Bun by using explicit runtime entrypoints for `alien-signals`, `signal-polyfill`, and `solid-js` adapters.
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
- Updated dependencies [0904040]
- Updated dependencies [31bc71c]
- Updated dependencies [6060d47]
- Updated dependencies [17dea80]
- Updated dependencies [bff4c43]
- Updated dependencies [19fdbfe]
- Updated dependencies [8eaa826]
- Updated dependencies [17bd119]
  - @umpire/core@1.0.0

## 0.1.0-alpha.10

### Patch Changes

- 73cd485: - Add a shared `snapshotValue()` helper at `@umpire/core/snapshot` for cloning previous plain-data snapshots without changing custom-instance comparison semantics.
  - Use shared snapshotting across the React, devtools, signals, Pinia, Vuex, Redux, and TanStack Store integrations so in-place nested plain-object mutations do not rewrite the saved "before" snapshot.
- 27c5cc4: - Add `@umpire/solid` as a first-class Solid adapter package with `useUmpire()` for component-local state and `fromSolidStore()` for shared store or context state.
  - Add Solid adapter docs, examples, tests, and repo wiring so the package is discoverable and validated alongside the existing adapters.
  - Fix the `@umpire/signals/solid` adapter typing so the package builds cleanly when `solid-js` types are installed.
- Updated dependencies [e570cac]
- Updated dependencies [73cd485]
- Updated dependencies [1fcfe46]
  - @umpire/core@1.0.0

## 0.1.0-alpha.9

### Patch Changes

- Vue and Solid adapter support added alongside existing alien/preact/tc39 signal adapters

## 0.1.0-alpha.8

_Version skipped (internal)_

## 0.1.0-alpha.7

### Major Changes

- `flag()` → `play()` rename (follows core)

## 0.1.0-alpha.5

### Patch Changes

- Fixed signal cycle: removed `version.set()` inside effect (was causing infinite update loops)
- `penalties` → `fouls` rename (follows core)

## 0.1.0-alpha.4

### Patch Changes

- `context` → `conditions` rename (follows core)
- Converted signals demos to native Preact

## 0.1.0-alpha.2

### Minor Changes

- Initial release: reactive adapter with alien-signals, preact/signals, TC39 proposal support
- `SignalProtocol` interface for pluggable signal libraries
