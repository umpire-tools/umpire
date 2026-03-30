# @umpire/zustand

- Use `fromStore(ump, store, { select, context? })` to connect Umpire to a Zustand store.
- Zustand's native `subscribe()` provides `(next, prev)` snapshots, so no manual previous-value tracking is needed.
- Access field state through `field(name)`.
- Read transition recommendations from `penalties`.
- Use `subscribe(listener)` to react to availability and penalty updates.
