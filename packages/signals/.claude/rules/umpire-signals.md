# @umpire/signals

- Use `reactiveUmp(ump, adapter, options?)` to create a reactive wrapper around an umpire instance.
- Destructuring reactive field access for reads is fine.
- Do not use spread syntax or `Object.keys()` on the reactive proxy; that defeats fine-grained tracking.
- `penalties` require the adapter to provide `effect()`. They are unavailable with the TC39 signal polyfill adapter.
- Access reactive state through `field(name).get()`, `set(name, value)`, and `update(partial)`.
