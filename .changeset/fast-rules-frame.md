---
'@umpire/core': patch
---

Improves `check()` and `play()` performance by routing built-in rule evaluation through direct per-target evaluators, including inside composite `anyOf()` and `eitherOf()` rules. Adds memory and leak benchmark modes for core performance investigation.
