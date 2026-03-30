# @umpire/core

- Create an umpire with `umpire({ fields, rules })`.
- Field satisfaction is presence-based by default: a field is satisfied unless its value is `null` or `undefined`.
- Override satisfaction per field with `isEmpty` when empty strings, empty arrays, or domain-specific sentinels should count as unsatisfied.
- Use `enabledWhen`, `disables`, `requires`, `oneOf`, `anyOf`, and `check` to express availability rules.
- `requires` checks both dependency value satisfaction and dependency availability.
- `disables` and `oneOf` check source values only, not source availability.
- Rules targeting the same field are ANDed. Use `anyOf(...)` when you need OR logic.
- Do not drive availability with `useEffect`; derive it from `ump.check(values, context?)` during render or selector evaluation.
- Use `flag(before, after)` for transition-time reset recommendations, not on every render.
- Use `init(overrides?)` to seed default field values from field definitions.
- Use `challenge(field, values, context?, prev?)` for debugging rule traces and transitive dependency failures.
- Predicates receive values and optional context, not the computed availability map.
