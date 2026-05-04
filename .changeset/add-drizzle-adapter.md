---
---

Add `@umpire/drizzle` as an RC adapter for Drizzle ORM 1.0 table metadata.

- `fromDrizzleTable(table, options?)` derives Umpire field definitions from Drizzle columns using Drizzle's public `getColumns()` helper.
- Primary keys and generated columns are excluded by default; static primitive defaults are copied into Umpire field defaults; SQL and runtime defaults make fields optional without copying storage-layer behavior.
- The package re-exports `checkCreate` and `checkPatch` from `@umpire/write` for service-layer policy checks before Drizzle inserts and updates.
- Add Drizzle-aware write validation: `checkDrizzleCreate`, `checkDrizzlePatch`, `checkDrizzleModelCreate`, `checkDrizzleModelPatch`, `createDrizzlePolicy`, `createDrizzleModelPolicy`. Add `DrizzleWriteResult`, `DrizzleModelWriteResult` extending `WriteComposedResult` from `@umpire/write`, and structured issue buckets (`issues.columns`, `issues.rules`, `issues.schema`). Validation adapter composition uses `WriteValidationAdapter` from `@umpire/write` (satisfied by `@umpire/zod` and `@umpire/effect` adapters).
