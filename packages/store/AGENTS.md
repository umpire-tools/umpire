# @umpire/store

- Use `fromStore(ump, store, { select, conditions? })` when the store exposes `getState()` plus `subscribe((next, prev) => unsubscribe)`.
- `select()` should assemble the exact values object Umpire needs. Put external context in `conditions()`, not in fake fields.
- Consumers read availability through `field(name)`, `getAvailability()`, `fouls`, `subscribe(listener)`, and `destroy()`.
- Framework-specific store adapters normalize their subscription APIs and then delegate here.
