# @umpire/json

- Use `fromJson(schema)` to hydrate portable Umpire configs and `toJson({ fields, rules, validators?, conditions? })` to serialize them back out.
- If a rule or validator must round-trip through JSON, build it from `namedValidators.*()` or the `*Expr` and `*Json` helpers. Arbitrary predicates cannot be serialized cleanly.
- `toJson()` preserves unsupported pieces in `excluded`; it should not silently drop behavior.
- For untrusted input (user input, localStorage, API responses), prefer `fromJsonSafe(raw)` — it validates and hydrates in one call and never throws. Use `parseJsonSchema(raw)` when you need the validated schema separately before hydrating. Both return `{ ok: true, ... } | { ok: false, errors: string[] }`. Reach for `validateSchema()` directly only when you need low-level access to the validation step itself.
