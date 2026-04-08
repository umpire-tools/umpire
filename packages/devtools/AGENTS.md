# @umpire/devtools

- Mount the panel once in development, preferably behind a dynamic import.
- Register each ump instance with `register(id, ump, values, conditions, options?)` on the same render path as `ump.check()`, or use `@umpire/devtools/react`.
- Pass `reads` and optional `readInput` when you want the panel to show read-table bridges and inspections.
- `mount()` and `register()` are no-ops in production unless `UMPIRE_INTERNAL=true`.
- `@umpire/devtools/slim` keeps Preact external when the host app already has it.
