---
"@umpire/eslint-plugin": patch
---

- Fix `no-inline-umpire-init` so `useMemo()` only suppresses warnings when it wraps `umpire()` inside the nearest React component or hook boundary.
- Add `eitherOf()` coverage to `no-unknown-fields` so nested branch field references stay validated.
