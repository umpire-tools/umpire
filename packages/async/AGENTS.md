# @umpire/async

- `@umpire/async` is a superset of `@umpire/core` that supports async rules and validators.
- Import `umpire()` from this package (`import { umpire } from '@umpire/async'`) when you need async predicates or async validators.
- Async rules have a `__async: true` marker. Sync rules from core or the field DSL are wrapped transparently via `toAsyncRule()`.
- `check()`, `play()`, `scorecard()`, and `challenge()` return promises. `init()` and `graph()` stay synchronous.
- Cancellation is built in: auto-cancel on subsequent calls, external `AbortSignal` support, and an `onAbort` hook.
- The topological evaluation order is preserved — fields are evaluated sequentially; gate rules per field can run in parallel.
