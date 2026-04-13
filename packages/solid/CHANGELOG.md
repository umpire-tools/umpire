# @umpire/solid

## 0.1.0-alpha.10

### Minor Changes

- 27c5cc4: - Add `@umpire/solid` as a first-class Solid adapter package with `useUmpire()` for component-local state and `fromSolidStore()` for shared store or context state.
  - Add Solid adapter docs, examples, tests, and repo wiring so the package is discoverable and validated alongside the existing adapters.
  - Fix the `@umpire/signals/solid` adapter typing so the package builds cleanly when `solid-js` types are installed.

### Patch Changes

- Updated dependencies [e570cac]
- Updated dependencies [73cd485]
- Updated dependencies [1fcfe46]
- Updated dependencies [27c5cc4]
  - @umpire/core@0.1.0
  - @umpire/signals@0.1.0

## 0.1.0-alpha.9

### Minor Changes

- Initial release: `useUmpire()` hook for Solid with accessor-based inputs and outputs
- Added `fromSolidStore()` for shared Solid store/context integrations
