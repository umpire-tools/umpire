# @umpire/async

## 1.0.1

### Patch Changes

- Updated dependencies [8d55445]
  - @umpire/core@1.1.1

## 1.0.0

### Minor Changes

- 7f036c2: Add `@umpire/async` — async-aware superset of core with async rule predicates, async validators, built-in cancellation (auto-cancel + AbortSignal), and an `onAbort` hook. Core gains a non-public `@umpire/core/internal` subpath for first-party helper access.

### Patch Changes

- 7f036c2: Fix `challenge()` and `scorecard({ includeChallenge: true })` to report actual per-rule `passed`/`reason` values instead of always returning `passed: true`. Each target rule is now re-evaluated individually after the main availability pass, using the computed availability map as context. Also fixes a memory leak in the `composeAbortSignals` fallback path (event listeners are now cleaned up when a check completes), and adds a per-field abort check inside the `evaluateAsync` loop so cancellation is respected between field evaluations.
- Updated dependencies [7f036c2]
- Updated dependencies [102318e]
- Updated dependencies [c52a2e8]
  - @umpire/core@1.1.0
