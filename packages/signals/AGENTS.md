# @umpire/signals

- Use `reactiveUmp(ump, adapter, options?)` to create a signal-backed umpire wrapper.
- Read field availability through `form.field('name').enabled`, `.fair`, `.required`, `.reason`, and `.reasons`.
- Update values through `set(name, value)` or `update(partial)`. Avoid spreading or eagerly enumerating reactive objects just to read them.
- `fouls` require the adapter to provide `effect()`. The TC39 adapter supports availability reads but not foul tracking.
- Ready-made adapters ship at `@umpire/signals/alien`, `@umpire/signals/preact`, `@umpire/signals/tc39`, `@umpire/signals/vue`, and `@umpire/signals/solid`.
