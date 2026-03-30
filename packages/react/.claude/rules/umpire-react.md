# @umpire/react

- Use `useUmpire(ump, values, context?)` to derive availability inside React components.
- The hook returns `{ check, penalties }`.
- Do not use `useEffect` to react to availability changes; availability is derived each render.
- `check` is a plain `AvailabilityMap` object. Read fields like `check.fieldName.enabled`.
- `penalties` come from `ump.flag()` comparing the current render snapshot to the previous one.
- Previous-snapshot tracking is handled internally by the hook with `useRef`.
