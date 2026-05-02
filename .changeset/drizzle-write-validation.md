---
"@umpire/drizzle": minor
---

Add Drizzle-aware write validation: `checkDrizzleCreate`, `checkDrizzlePatch`, `checkDrizzleModelCreate`, `checkDrizzleModelPatch`, `createDrizzlePolicy`, `createDrizzleModelPolicy`. Remove `@umpire/write` re-exports (`checkCreate`/`checkPatch`). Add first-class validation adapter composition via `UmpireValidationAdapter` structural protocol. Add `DrizzleWriteResult`, `DrizzleModelWriteResult`, and structured issue buckets (`issues.columns`, `issues.rules`, `issues.schema`).
