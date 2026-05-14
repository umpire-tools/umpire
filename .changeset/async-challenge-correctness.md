---
'@umpire/async': patch
---

Fix `challenge()` and `scorecard({ includeChallenge: true })` to report actual per-rule `passed`/`reason` values instead of always returning `passed: true`. Each target rule is now re-evaluated individually after the main availability pass, using the computed availability map as context. Also fixes a memory leak in the `composeAbortSignals` fallback path (event listeners are now cleaned up when a check completes), and adds a per-field abort check inside the `evaluateAsync` loop so cancellation is respected between field evaluations.
