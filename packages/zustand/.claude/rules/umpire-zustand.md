# @umpire/zustand

- Use `fromStore(ump, store, { select, conditions? })` to connect Umpire to a Zustand store.
- `@umpire/zustand` is a named re-export of `@umpire/store`; Zustand already satisfies the strict `(next, prev)` subscription contract.
- Access field state through `field(name)`.
- Read transition recommendations from `fouls`.
- Use `subscribe(listener)` to react to availability and foul updates.
