---
"@umpire/core": patch
---

Make `scorecard()` reject incomplete snapshots with a clear error that names the missing field keys and directs callers to pass `null` for fields they intentionally leave unset.
