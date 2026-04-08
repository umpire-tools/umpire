# @umpire/vuex

- Use `fromVuexStore(ump, store, { select, conditions? })` to connect a Vuex store to Umpire.
- Vuex subscriptions do not provide previous state, so this adapter snapshots store state before delegating to `@umpire/store`.
- `select()` should assemble the exact values object Umpire needs from store state.
- Consumers read the resulting wrapper through `field(name)`, `getAvailability()`, `fouls`, `subscribe(listener)`, and `destroy()`.
