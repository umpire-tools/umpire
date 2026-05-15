---
'@umpire/effect': minor
---

Effect-native validation with full service/context support: `runEffect` and `runValidate` now use Effect Schema's effectful decode path, supporting service-requiring schemas (R ≠ never) through the Effect `R` channel. Sync APIs (`run`, `validators`) are conditionally available only for context-free schemas via `SyncAdapterMembers`.

New `decodeEffectSchema` helper for effectful schema decoding and `decodeEffectSchemaSync` for context-free sync decoding. New `availabilityStreamAsync` and `umpireAsyncLayer` for `@umpire/async` instances. Also includes `UmpireValidationError` tagged error, `availabilityStream`, and `umpireLayer` for `@umpire/core`.
