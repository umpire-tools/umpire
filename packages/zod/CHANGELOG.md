# @umpire/zod

## 0.1.0

### Patch Changes

- c57b61e: - `@umpire/devtools` now includes a dedicated `conditions` tab and a generalized extension API for custom devtools tabs.
  - `@umpire/devtools` keeps `reads` support as backwards-compatible sugar on top of the new extension system.
  - `@umpire/zod` now exposes `@umpire/zod/devtools`, a validation-tab helper for `@umpire/devtools`.
  - `@umpire/zod/devtools` can surface active validation errors, suppressed issues, unmapped issues, and active schema fields.
  - `@umpire/zod/devtools` supports a context-driven `resolve(...)` mode so validation tabs can derive from devtools inspect context and `scorecard.check` without a direct dependency on `@umpire/devtools`.

## 0.1.0-alpha.9

### Patch Changes

- Docs and README added

## 0.1.0-alpha.8

_Version skipped (internal)_

## 0.1.0-alpha.7

### Patch Changes

- README published

## 0.1.0-alpha.6

### Minor Changes

- Initial release: availability-aware Zod validation helpers
- `activeSchema()` — builds a Zod schema from only the currently-enabled fields
- Detects `z.object()` passed instead of `.shape` with a helpful error
- `reactive foul()` integration for live validation feedback
