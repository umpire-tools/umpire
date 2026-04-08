# @umpire/json

- Use `fromJson(schema)` to hydrate portable Umpire configs and `toJson({ fields, rules, conditions? })` to serialize them back out.
- If a rule must round-trip through JSON, build it from `checks.*()` or the `*Expr` and `*Json` helpers. Arbitrary predicates cannot be serialized cleanly.
- `toJson()` preserves unsupported pieces in `excluded`; it should not silently drop behavior.
- Use `validateSchema()` before hydration when JSON comes from an untrusted source.
