---
"@umpire/json": minor
---

- Add portable JSON schema support for `eitherOf()` via `{ type: "eitherOf", group, branches }`.
- Add `eitherOfJson(groupName, branches)` and expose it through `createJsonRules()` for JSON-authored named OR paths.
- `fromJson()`, `toJson()`, and `validateSchema()` now understand `eitherOf()` and preserve the same branch-shape invariants as core.
- `validateSchema()` now rejects malformed `anyOf()` and `eitherOf()` composites earlier instead of deferring those errors to hydration.
- Add conformance coverage for `eitherOf()` auth-path flows in the JSON fixture suite.
