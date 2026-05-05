---
"@umpire/effect": patch
"@umpire/zod": patch
---

Add `valueShape: "nested"` to validate composed nested schemas from flat dotted Umpire field keys. Nested validation preserves the default flat behavior, maps nested validation paths back to flat field names such as `account.companyName`, and must be paired with the existing `build()` composition hook so the nested value view is used intentionally.
