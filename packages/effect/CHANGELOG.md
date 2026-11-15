# @umpire/effect

## 1.2.1

### Patch Changes

- Updated dependencies [8d55445]
  - @umpire/core@1.1.1
  - @umpire/async@1.0.1

## 1.2.0

### Minor Changes

- 6b86de4: Effect-native validation with full service/context support: `runEffect` and `runValidate` now use Effect Schema's effectful decode path, supporting service-requiring schemas (R ≠ never) through the Effect `R` channel. Sync APIs (`run`, `validators`) are conditionally available only for context-free schemas via `SyncAdapterMembers`.

  New `decodeEffectSchema` helper for effectful schema decoding and `decodeEffectSchemaSync` for context-free sync decoding. New `availabilityStreamAsync` and `umpireAsyncLayer` for `@umpire/async` instances, plus `toAsyncWriteValidationAdapter` for bridging Effect validation into async write/Drizzle flows. Also includes `UmpireValidationError` tagged error, `availabilityStream`, and `umpireLayer` for `@umpire/core`.

### Patch Changes

- Updated dependencies [7f036c2]
- Updated dependencies [7f036c2]
- Updated dependencies [7f036c2]
- Updated dependencies [102318e]
- Updated dependencies [c52a2e8]
- Updated dependencies [6b86de4]
  - @umpire/async@1.0.0
  - @umpire/core@1.1.0
  - @umpire/write@1.2.0
  - @umpire/store@1.0.1

## 1.1.1

### Patch Changes

- 4ce437f: Add `valueShape: "nested"` to validate composed nested schemas from flat dotted Umpire field keys. Nested validation preserves the default flat behavior, maps nested validation paths back to flat field names such as `account.companyName`, and must be paired with the existing `build()` composition hook so the nested value view is used intentionally.
- Updated dependencies [4ce437f]
- Updated dependencies [4ce437f]
- Updated dependencies [4ce437f]
  - @umpire/core@1.0.1
  - @umpire/write@1.1.0

## 1.1.0

### Minor Changes

- 95ea3e3: Add `@umpire/effect` — Effect v4 Schema adapter and SubscriptionRef store bridge for `@umpire/core`.
  - Supports the Effect v4 beta/stable line via a prerelease-aware peer dependency range.
  - `decodeEffectSchemaSync(schema, input, options?)` normalizes Effect v4 `Result` values into a stable `{ _tag: "Right" | "Left" }` shape for sync adapter internals and manual context-free `deriveSchema()` usage.
  - `createEffectAdapter()({ schemas, rejectFoul?, build? })` mirrors `createZodAdapter` using Effect Schema. Per-field schemas drive both the per-field validators wired into `umpire()` and a full availability-aware struct schema used by `run()`. Schemas with service/context dependencies are not supported in the synchronous evaluation model.
  - `deriveSchema(availability, schemas, options?)` builds an availability-aware `Schema.Struct` from field-level schemas: disabled fields are excluded, optional fields get `Schema.optional()`, and `rejectFoul: true` injects an always-failing refinement (using the field's `reason`) for foul fields.
  - `effectErrors(parseError)` flattens Effect schema parse errors or issues into `{ field, message }[]`.
  - `fromSubscriptionRef(ump, ref, options)` bridges an Effect `SubscriptionRef<S>` to the `@umpire/store` contract, running a background fiber over the ref changes stream to track state transitions and compute fouls.
