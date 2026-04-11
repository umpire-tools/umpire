---
"@umpire/json": patch
---

- `@umpire/json` now supports top-level `validators` in the portable schema for field-local validation metadata.
- `fromJson()` now returns `{ fields, rules, validators }` so parsed schemas can feed portable validators straight into `umpire()`.
- `toJson()` now accepts `validators` and serializes portable validators from `namedValidators.*()` into the JSON `validators` section.
- `@umpire/json` now exposes `namedValidators.*()` and validator-first type names such as `JsonValidatorOp` and `JsonValidatorSpec`.
- `@umpire/json` keeps `expr.check()` for structural predicates and preserves top-level `"check"` rules as the legacy structural compatibility form.
