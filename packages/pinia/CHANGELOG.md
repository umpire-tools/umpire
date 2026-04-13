# @umpire/pinia

## 0.1.0-alpha.10

### Patch Changes

- 73cd485: - Add a shared `snapshotValue()` helper at `@umpire/core/snapshot` for cloning previous plain-data snapshots without changing custom-instance comparison semantics.
  - Use shared snapshotting across the React, devtools, signals, Pinia, Vuex, Redux, and TanStack Store integrations so in-place nested plain-object mutations do not rewrite the saved "before" snapshot.
- Updated dependencies [e570cac]
- Updated dependencies [73cd485]
- Updated dependencies [1fcfe46]
  - @umpire/core@0.1.0

## 0.1.0-alpha.9

### Minor Changes

- Initial release: Pinia store adapter for Vue projects
