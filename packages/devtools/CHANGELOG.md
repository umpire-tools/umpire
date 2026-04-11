# @umpire/devtools

## 0.1.0

### Patch Changes

- c57b61e: - `@umpire/devtools` now includes a dedicated `conditions` tab and a generalized extension API for custom devtools tabs.
  - `@umpire/devtools` keeps `reads` support as backwards-compatible sugar on top of the new extension system.
  - `@umpire/zod` now exposes `@umpire/zod/devtools`, a validation-tab helper for `@umpire/devtools`.
  - `@umpire/zod/devtools` can surface active validation errors, suppressed issues, unmapped issues, and active schema fields.
  - `@umpire/zod/devtools` supports a context-driven `resolve(...)` mode so validation tabs can derive from devtools inspect context and `scorecard.check` without a direct dependency on `@umpire/devtools`.

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
