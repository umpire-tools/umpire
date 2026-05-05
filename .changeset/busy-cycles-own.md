---
'@umpire/eslint-plugin': patch
---

Extends `no-write-owned-fields` rule to cover Drizzle write helpers (`checkDrizzleCreate`, `checkDrizzlePatch`, `checkDrizzleModelCreate`, `checkDrizzleModelPatch`) with correct candidate argument positions.
