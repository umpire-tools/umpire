# @umpire/react

## 1.0.0

### Patch Changes

- fee01cf: code formatting & type adjustments for better consistency
- 4eecbeb: Loosen `InputValues` from a generic `FieldValues<F>` alias to `Record<string, unknown>`. Consumer call sites (`check()`, `play()`, `useUmpire()`, adapters) no longer require casts when passing form state or dynamic records. Predicate callbacks keep `FieldValues<F>` for typed field access. Remove phantom `F` parameter from `Snapshot` — only `C` (conditions) is structurally used.
- 4d8bd6c: adjusted publishing setup for `.claude` rules (i don't even honestly know if this kind of thing works. hopefully it's helpful!)
- Updated dependencies [135e347]
- Updated dependencies [5b6ab7d]
- Updated dependencies [39be228]
- Updated dependencies [9bc562b]
- Updated dependencies [86280aa]
- Updated dependencies [fee01cf]
- Updated dependencies [82fdd4b]
- Updated dependencies [4eecbeb]
- Updated dependencies [4d8bd6c]
- Updated dependencies [7fb75bf]
- Updated dependencies [aad8d17]
- Updated dependencies [0904040]
- Updated dependencies [31bc71c]
- Updated dependencies [6060d47]
- Updated dependencies [17dea80]
- Updated dependencies [bff4c43]
- Updated dependencies [19fdbfe]
- Updated dependencies [8eaa826]
- Updated dependencies [17bd119]
  - @umpire/core@1.0.0

## 0.1.0-alpha.10

### Minor Changes

- e570cac: Add browser/CDN builds via tsdown

  Both `@umpire/core` and `@umpire/react` now ship bundled browser artifacts alongside the existing ESM build:
  - `dist/index.browser.js` — minified ESM for `<script type="module">` and esm.sh
  - `dist/index.iife.js` — IIFE with `window.Umpire` / `window.UmpireReact` globals

  Both packages now expose a `browser` field and `"browser"` export condition pointing at the ESM build, so bundlers targeting browser environments resolve the right artifact automatically.

  Unpkg / jsDelivr / esm.sh access is automatic — no extra configuration required after publish.

### Patch Changes

- 73cd485: - Add a shared `snapshotValue()` helper at `@umpire/core/snapshot` for cloning previous plain-data snapshots without changing custom-instance comparison semantics.
  - Use shared snapshotting across the React, devtools, signals, Pinia, Vuex, Redux, and TanStack Store integrations so in-place nested plain-object mutations do not rewrite the saved "before" snapshot.
- Updated dependencies [e570cac]
- Updated dependencies [73cd485]
- Updated dependencies [1fcfe46]
  - @umpire/core@1.0.0

## 0.1.0-alpha.9

### Patch Changes

- Debug support improvements, test coverage expansion

## 0.1.0-alpha.8

_Version skipped (internal)_

## 0.1.0-alpha.7

### Major Changes

- `flag()` → `play()` rename (follows core)

## 0.1.0-alpha.6

### Patch Changes

- `foul()` reactive accessor available in hook output

## 0.1.0-alpha.5

### Minor Changes

- `penalties` → `fouls` rename (follows core)
- `InputValues` loosened at public API

## 0.1.0-alpha.4

### Patch Changes

- `context` → `conditions` rename (follows core)

## 0.1.0-alpha.2

### Minor Changes

- Initial release: `useUmpire` hook with reactive field state
