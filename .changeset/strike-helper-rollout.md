---
'@umpire/core': minor
---

Add a first-class `strike(values, fouls)` helper for applying foul suggestions to values in one pure operation.

`strike` now preserves referential stability by returning the original values object when there are no fouls or when all suggestions are already applied.
