---
'@umpire/store': patch
---

Fix `fromStore` condition handling by removing the unsafe `undefined as unknown as C` cast and passing `undefined` when no `conditions` selector is provided.
