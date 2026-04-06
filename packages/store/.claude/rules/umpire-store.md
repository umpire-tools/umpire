# @umpire/store

- Use `fromStore(ump, store, { select, conditions? })` when your store exposes `getState()` plus `subscribe((next, prev) => unsubscribe)`.
- Keep the store contract strict: adapters for Redux, TanStack Store, and similar libraries should normalize into `(next, prev)` before calling `fromStore()`.
- Use `select()` to assemble the exact values Umpire needs, even when they live across multiple store slices.
- Access field state through `field(name)`, `getAvailability()`, and `fouls`.
