# @umpire/eslint-plugin

- Catches umpire misuse that TypeScript and runtime cannot: typo'd field names in rules, inline instance creation in React components, and self-disabling fields.
- Rules match calls by function name (`umpire`, `requires`, `disables`, etc.) — no import tracking.
- `no-unknown-fields`: bails out silently if the `fields` object contains spread elements, to avoid false positives.
- `no-inline-umpire-init`: only fires inside functions whose name starts with an uppercase letter or `use`; wrapping with `useMemo` suppresses the warning.
- Add new rules in `src/rules/`, export from `src/index.ts`, and add test coverage in `__tests__/`.
