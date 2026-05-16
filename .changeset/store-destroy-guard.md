---
'@umpire/store': patch
---

Ensure `fromStore().destroy()` immediately suppresses late adapter emissions before calling the underlying unsubscribe.
