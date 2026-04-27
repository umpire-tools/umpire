# @umpire/zod

## 1.0.0

### Minor Changes

- 65fc0a9: Add `deriveOneOf` and `deriveDiscriminatedFields` to derive umpire `oneOf` rules from Zod `z.discriminatedUnion` schemas. Supports both Zod v3 and v4.

### Patch Changes

- fee01cf: code formatting & type adjustments for better consistency
- 82fdd4b: Clean up duplicated internals across adapters and JSON tooling by sharing guards, JSON clone helpers, and store previous-state tracking, while simplifying reactive and snapshot plumbing.

  Also tighten package metadata by marking `react` as an optional peer for `@umpire/devtools`.

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

- 0ee935e: - Rename `activeSchema()` to `deriveSchema()` for clearer naming consistency with the rest of the `@umpire/zod` surface.
  - Rename `activeErrors()` to `deriveErrors()`.
  - Rename `createZodValidation()` to `createZodAdapter()`, matching the existing adapter-oriented type naming.
  - Rename the exported adapter types to `CreateZodAdapterOptions`, `ZodAdapter`, and `ZodAdapterRunResult`.
  - Update the `@umpire/zod` docs, examples, and devtools copy to use the new derived-schema terminology consistently.
- ba5419b: - `activeSchema` now accepts an optional third argument `{ rejectFoul?: boolean }`.
  - When `rejectFoul: true`, enabled fields whose value is foul (`fair: false`) are included in the schema with a refinement that always fails, using the field's `reason` as the error message.
  - `createZodValidation` accepts the same `rejectFoul` option and threads it through every `run()` call.
  - Use this option on the server to reject contextually invalid submissions (e.g. a gas vehicle in an electric-only parking spot) rather than silently accepting or stripping them.
  - Default is `false`; existing client-side usage is unaffected.

### Patch Changes

- c57b61e: - `@umpire/devtools` now includes a dedicated `conditions` tab and a generalized extension API for custom devtools tabs.
  - `@umpire/devtools` keeps `reads` support as backwards-compatible sugar on top of the new extension system.
  - `@umpire/zod` now exposes `@umpire/zod/devtools`, a validation-tab helper for `@umpire/devtools`.
  - `@umpire/zod/devtools` can surface active validation errors, suppressed issues, unmapped issues, and active schema fields.
  - `@umpire/zod/devtools` supports a context-driven `resolve(...)` mode so validation tabs can derive from devtools inspect context and `scorecard.check` without a direct dependency on `@umpire/devtools`.
- Updated dependencies [e570cac]
- Updated dependencies [73cd485]
- Updated dependencies [1fcfe46]
  - @umpire/core@1.0.0

## 0.1.0-alpha.9

### Patch Changes

- Docs and README added

## 0.1.0-alpha.8

_Version skipped (internal)_

## 0.1.0-alpha.7

### Patch Changes

- README published

## 0.1.0-alpha.6

### Minor Changes

- Initial release: availability-aware Zod validation helpers
- Schema derivation from only the currently-enabled fields
- Detects `z.object()` passed instead of `.shape` with a helpful error
- `reactive foul()` integration for live validation feedback
