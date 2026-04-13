# @umpire/devtools

## 0.1.0-alpha.10

### Patch Changes

- c57b61e: - `@umpire/devtools` now includes a dedicated `conditions` tab and a generalized extension API for custom devtools tabs.
  - `@umpire/devtools` keeps `reads` support as backwards-compatible sugar on top of the new extension system.
  - `@umpire/zod` now exposes `@umpire/zod/devtools`, a validation-tab helper for `@umpire/devtools`.
  - `@umpire/zod/devtools` can surface active validation errors, suppressed issues, unmapped issues, and active schema fields.
  - `@umpire/zod/devtools` supports a context-driven `resolve(...)` mode so validation tabs can derive from devtools inspect context and `scorecard.check` without a direct dependency on `@umpire/devtools`.
- 73cd485: - Add a shared `snapshotValue()` helper at `@umpire/core/snapshot` for cloning previous plain-data snapshots without changing custom-instance comparison semantics.
  - Use shared snapshotting across the React, devtools, signals, Pinia, Vuex, Redux, and TanStack Store integrations so in-place nested plain-object mutations do not rewrite the saved "before" snapshot.
- 1fcfe46: - Add `eitherOf(groupName, branches)`, a new core rule helper for named OR paths where each branch is a group of ANDed rules.
  - `eitherOf()` supports both availability and fairness constraints, validates that inner rules share the same targets and constraint, and allows multiple branches to pass at once.
  - `challenge()` and `inspectRule()` now preserve `eitherOf()` branch structure so named paths are visible in debugging output.
  - `@umpire/devtools` now renders `eitherOf()` branch groups in the challenge drawer so named paths are readable during inspection.
- Updated dependencies [e570cac]
- Updated dependencies [73cd485]
- Updated dependencies [1fcfe46]
  - @umpire/core@0.1.0

## 0.1.0-alpha.9

### Minor Changes

- Alternate React hook for devtools panel
- Registry coverage tests expanded
- Panel state sync cleanup

## 0.1.0-alpha.8

_Version skipped (internal; first published in alpha.9 pipeline)_

### Minor Changes

- Initial release: debug panel for inspecting umpire field state in real time
- Debug panel added to all example pages
- Panel state sync with live umpire instance
