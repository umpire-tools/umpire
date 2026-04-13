---
"@umpire/core": patch
"@umpire/devtools": patch
"@umpire/pinia": patch
"@umpire/react": patch
"@umpire/redux": patch
"@umpire/signals": patch
"@umpire/tanstack-store": patch
"@umpire/vuex": patch
---

- Add a shared `snapshotValue()` helper at `@umpire/core/snapshot` for cloning previous plain-data snapshots without changing custom-instance comparison semantics.
- Use shared snapshotting across the React, devtools, signals, Pinia, Vuex, Redux, and TanStack Store integrations so in-place nested plain-object mutations do not rewrite the saved "before" snapshot.
