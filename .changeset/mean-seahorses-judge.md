---
"@umpire/json": patch
---

Replace `NamedCheck<any>` return types with `NamedCheck<unknown>` in json validator hydration helpers to avoid unsafe `any` widening for consumers.
