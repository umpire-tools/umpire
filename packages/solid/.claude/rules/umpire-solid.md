# @umpire/solid

- Use `useUmpire(ump, values, conditions?)` to derive availability inside Solid components.
- Use `fromSolidStore(ump, { values, set, conditions? })` when a shared Solid store/context should back one Umpire instance for many children.
- `values` and `conditions` are accessors.
- The hook returns `{ check, fouls }`, and both are accessors.
- `check()` is derived reactively; do not mirror it into store state or recompute it in `createEffect`.
- `fouls()` are transition-time recommendations from the previous snapshot; the hook handles snapshot tracking internally.
