# @umpire/eslint-plugin

- Catches umpire misuse that TypeScript and runtime cannot: typo'd field names in rules, inline instance creation in React components, database-owned write fields, and self-disabling fields.
- Rules match calls by function name (`umpire`, `requires`, `disables`, etc.) — no import tracking.
- `no-unknown-fields`: bails out silently if the `fields` object contains spread elements, to avoid false positives.
- `no-inline-umpire-init`: only fires inside functions whose name starts with an uppercase letter or `use`; wrapping with `useMemo` suppresses the warning.
- `no-write-owned-fields`: defaults to `id`, checks literal `checkCreate`/`checkPatch` candidates, and requires explicit excludes on Drizzle helpers. Keep it literal-only to avoid noisy false positives.
- Add new rules in `src/rules/`, export from `src/index.ts`, and add test coverage in `__tests__/`.
