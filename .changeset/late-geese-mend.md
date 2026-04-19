---
'@umpire/core': minor
'@umpire/devtools': patch
'@umpire/dsl': patch
'@umpire/json': patch
'@umpire/pinia': patch
'@umpire/redux': patch
'@umpire/signals': patch
'@umpire/solid': patch
'@umpire/store': patch
'@umpire/tanstack-store': patch
'@umpire/vuex': patch
'@umpire/zod': patch
---

Clean up duplicated internals across adapters and JSON tooling by sharing guards, JSON clone helpers, and store previous-state tracking, while simplifying reactive and snapshot plumbing.

Also tighten package metadata by marking `react` as an optional peer for `@umpire/devtools`.
