---
"@umpire/core": minor
"@umpire/testing": minor
---

Add core rule attribution metadata and testing coverage tracking.

`@umpire/core` now exposes `ump.rules()` with normalized rule entries and includes `ruleId`/`ruleIndex` on challenge reasons. `@umpire/testing` adds `trackCoverage()` to report observed field states and uncovered rule activations from instrumented `check()` and `scorecard()` calls.
