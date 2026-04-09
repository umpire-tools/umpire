---
"@umpire/devtools": patch
"@umpire/zod": patch
---

- `@umpire/devtools` now includes a dedicated `conditions` tab and a generalized extension API for custom devtools tabs.
- `@umpire/devtools` keeps `reads` support as backwards-compatible sugar on top of the new extension system.
- `@umpire/zod` now exposes `@umpire/zod/devtools`, a validation-tab helper for `@umpire/devtools`.
- `@umpire/zod/devtools` can surface active validation errors, suppressed issues, unmapped issues, and active schema fields.
- `@umpire/zod/devtools` supports a context-driven `resolve(...)` mode so validation tabs can derive from devtools inspect context and `scorecard.check` without a direct dependency on `@umpire/devtools`.
