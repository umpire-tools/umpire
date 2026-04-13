# @umpire/react

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
  - @umpire/core@0.1.0

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
