---
'@umpire/core': minor
'@umpire/react': patch
'@umpire/solid': patch
'@umpire/signals': patch
'@umpire/store': patch
'@umpire/devtools': patch
'@umpire/zod': patch
---

Loosen `InputValues` from a generic `FieldValues<F>` alias to `Record<string, unknown>`. Consumer call sites (`check()`, `play()`, `useUmpire()`, adapters) no longer require casts when passing form state or dynamic records. Predicate callbacks keep `FieldValues<F>` for typed field access. Remove phantom `F` parameter from `Snapshot` — only `C` (conditions) is structurally used.
