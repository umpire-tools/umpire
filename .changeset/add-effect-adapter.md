---
"@umpire/effect": minor
---

Add `@umpire/effect` — Effect Schema adapter and SubscriptionRef store bridge for `@umpire/core`.

- `createEffectAdapter({ schemas, rejectFoul?, build? })` mirrors `createZodAdapter` using Effect Schema. Per-field `Schema<A, I, never>` instances drive both the per-field validators wired into `umpire()` and a full availability-aware struct schema used by `run()`. `R = never` is required — schemas with context dependencies are not supported in the synchronous evaluation model.
- `deriveSchema(availability, schemas, options?)` builds an availability-aware `Schema.Struct` from field-level schemas: disabled fields are excluded, optional fields get `Schema.optional()`, and `rejectFoul: true` injects an always-failing refinement (using the field's `reason`) for foul fields.
- `effectErrors(parseError)` flattens Effect's `ParseIssue` tree into `{ field, message }[]` via `ParseResult.ArrayFormatter`.
- `fromSubscriptionRef(ump, ref, options)` bridges an Effect `SubscriptionRef<S>` to the `@umpire/store` contract, running a background fiber over `ref.changes` to track state transitions and compute fouls.
