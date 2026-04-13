# @umpire/signals

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
  - @umpire/core@0.1.0

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
