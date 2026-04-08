# @umpire/react

- Use `useUmpire(ump, values, conditions?)` to derive availability inside React components.
- The hook returns `{ check, fouls }`.
- `check` is derived each render; do not mirror it into component state or recompute it in `useEffect`.
- `fouls` are transition-time recommendations from the previous snapshot; the hook handles previous-value tracking internally.
