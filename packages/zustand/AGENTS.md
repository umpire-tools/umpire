# @umpire/zustand

- `@umpire/zustand` is a named re-export of `fromStore()` from `@umpire/store`.
- Use `fromStore(ump, store, { select, conditions? })` directly with Zustand; its subscription API already provides `(next, prev)`.
- Read the wrapper through `field(name)`, `getAvailability()`, `fouls`, `subscribe(listener)`, and `destroy()`.
- Do not add custom previous-state bookkeeping on top of Zustand just to use Umpire.
