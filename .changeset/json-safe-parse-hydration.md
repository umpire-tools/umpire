---
'@umpire/json': minor
---

Add safe JSON hydration APIs for untrusted input via `parseJsonSchema(raw)` and `fromJsonSafe(raw)`, returning `{ ok, ... }` results instead of requiring try/catch at call sites.

This keeps trusted-schema `fromJson(schema)` behavior unchanged while reducing userland casts and improving boundary validation ergonomics.
