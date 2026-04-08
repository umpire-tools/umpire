# @umpire/redux

- Use `fromReduxStore(ump, store, { select, conditions? })` to connect Redux or Redux Toolkit state to Umpire.
- Redux subscriptions do not provide previous state, so this adapter tracks the previous snapshot internally before delegating to `@umpire/store`.
- `select()` should assemble the exact values object Umpire needs from reducer state.
- Consumers read the resulting wrapper through `field(name)`, `getAvailability()`, `fouls`, `subscribe(listener)`, and `destroy()`.
