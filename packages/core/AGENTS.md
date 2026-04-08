# @umpire/core

- Umpire is a field-availability engine for any object-shaped state, not a form library.
- Create instances with `umpire({ fields, rules })`.
- Satisfaction is presence-based by default; override per field with `isEmpty` when empty strings, arrays, or domain sentinels should count as unsatisfied.
- `requires` checks both dependency satisfaction and dependency availability. `disables` and `oneOf` inspect source values only.
- Rules on the same target are ANDed. Use `anyOf(...)` for OR logic.
- Derive availability with `ump.check(values, conditions?, prev?)`. Use `play(before, after)` only for transition-time reset suggestions.
- Use `challenge()` and `scorecard()` for debugging, and `field<V>('name')` when you want typed rule inputs.
