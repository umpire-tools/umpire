---
"@umpire/core": patch
---

`scorecard()` now auto-fills missing field keys in snapshot values with `null`, with a `console.warn` in development to surface the gap. Callers no longer need to enumerate fields that don't hold state (e.g. submit buttons). Pass `null` explicitly to silence the warning.
