# @umpire/eslint-plugin

## 1.0.0

### Patch Changes

- fee01cf: code formatting & type adjustments for better consistency
- 4d8bd6c: adjusted publishing setup for `.claude` rules (i don't even honestly know if this kind of thing works. hopefully it's helpful!)

## 0.1.0-alpha.10

### Patch Changes

- e77d58e: - Fix `no-inline-umpire-init` so `useMemo()` only suppresses warnings when it wraps `umpire()` inside the nearest React component or hook boundary.
  - Add `eitherOf()` coverage to `no-unknown-fields` so nested branch field references stay validated.
