---
"@umpire/core": patch
"@umpire/reads": patch
---

Propagate `fairWhenRead()` and `enabledWhenRead()` value-input field dependencies into Umpire graph edges.

Read-backed rules now expose fields touched by their value-input reads as rule sources, so downstream graph consumers can observe upstream dependencies such as `country -> postalCode`. Self-dependencies are excluded, and condition-input or custom-selected reads remain conservative.
