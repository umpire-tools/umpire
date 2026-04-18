---
'@umpire/core': patch
---

Preserve literal branch-name typing for `oneOf(..., { activeBranch })` so `activeBranch` no longer widens to plain `string` at common call sites.

This improves TypeScript ergonomics by reducing casts when returning known branch keys.
