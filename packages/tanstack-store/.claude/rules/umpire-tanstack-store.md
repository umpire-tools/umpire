# @umpire/tanstack-store

- Use `fromTanStackStore(ump, store, { select, conditions? })` to connect a TanStack Store instance to Umpire.
- TanStack Store subscriptions do not provide previous state, so this adapter snapshots the previous `.state` value before delegating to `@umpire/store`.
- Keep `select()` focused on the exact values Umpire needs, even when they span multiple nested slices.
- Read transition cleanup recommendations from `fouls`.
