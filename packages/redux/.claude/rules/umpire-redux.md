# @umpire/redux

- Use `fromReduxStore(ump, store, { select, conditions? })` to connect a Redux store to Umpire.
- Redux subscriptions do not provide previous state, so this adapter tracks `prevState` internally before delegating to `@umpire/store`.
- Use `select()` to assemble the Umpire values object from whatever slices your reducers own.
- Read availability through `field(name)`, `getAvailability()`, and `fouls`.
