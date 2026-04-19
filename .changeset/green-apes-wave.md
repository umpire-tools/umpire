---
'@umpire/signals': minor
'@umpire/solid': minor
---

Tighten adapter typing so field and condition keys carry their value types end-to-end.

`reactiveUmp()` now type-checks external `signals` and `conditions` option entries against the umpire field and condition shapes, and `fromSolidStore()` now requires keyed `values`/`set()` signatures that align with those same field types.
