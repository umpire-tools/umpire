---
"@umpire/core": patch
---

Export `isEmptyNumber`, `isEmptyBigInt`, and `isEmptyBoolean` from `@umpire/core`. These typed primitive presence helpers (alongside existing `isEmptyPresent`, `isEmptyString`, `isEmptyArray`, `isEmptyObject`) treat `0`, `0n`, and `false` as satisfied values, consistent with database field semantics.
