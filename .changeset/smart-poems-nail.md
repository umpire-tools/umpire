---
"@umpire/solid": minor
"@umpire/signals": patch
---

- Add `@umpire/solid` as a first-class Solid adapter package with `useUmpire()` for component-local state and `fromSolidStore()` for shared store or context state.
- Add Solid adapter docs, examples, tests, and repo wiring so the package is discoverable and validated alongside the existing adapters.
- Fix the `@umpire/signals/solid` adapter typing so the package builds cleanly when `solid-js` types are installed.
