# @umpire/core

- Fields are not form fields — they can be minesweeper cells, roster slots, config options, pricing choices, or any named piece of interdependent state. Umpire is not a form library.
- Create an umpire with `umpire({ fields, rules })`.
- Field satisfaction is presence-based by default: a field is satisfied unless its value is `null` or `undefined`.
- Override satisfaction per field with `isEmpty` when empty strings, empty arrays, or domain-specific sentinels should count as unsatisfied.
- Use `enabledWhen`, `disables`, `requires`, `oneOf`, `anyOf`, and `check` to express availability rules.
- `requires` checks both dependency value satisfaction and dependency availability.
- `disables` and `oneOf` check source values only, not source availability.
- Rules targeting the same field are ANDed. Use `anyOf(...)` when you need OR logic.
- Do not drive availability with `useEffect`; derive it from `ump.check(values, conditions?)` during render or selector evaluation.
- Use `play(before, after)` for transition-time reset recommendations, not on every render.
- Use `init(overrides?)` to seed default field values from field definitions.
- Use `challenge(field, values, conditions?, prev?)` for debugging rule traces and transitive dependency failures.
- Predicates receive values and optional context, not the computed availability map.
- `oneOf` `activeBranch` function receives `(values, context)` — use context for external state like mode toggles, feature flags, or matchup data.
- Define fields statically when possible for compile-time field name checking. Dynamic `Record<string, FieldDef>` works but loses type safety.
