# @umpire/drizzle

- Use `fromDrizzleTable(table, options?)` to derive Umpire fields from Drizzle table columns.
- This adapter hydrates availability metadata only; keep business rules, value validation, authorization, and database constraints outside this package.
- Re-export write checks from `@umpire/write` so service layers can run `checkCreate`/`checkPatch` before Drizzle inserts or updates.
- Prefer Drizzle's public `getColumns()` API for table inspection. Do not reach into table symbols directly.
