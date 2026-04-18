# @umpire/json

Portable schema parsing and serialization for [@umpire/core](https://www.npmjs.com/package/@umpire/core), plus portable `namedValidators.*()` helpers that round-trip cleanly through JSON.

`@umpire/dsl` now owns the pure expression layer (`Expr`, `expr.*`, `compileExpr()`, `getExprFieldRefs()`).
`@umpire/json` owns the JSON-aware additions: `expr.check()`, `namedValidators.*()`, and portable JSON rule builders.

[Docs](https://sdougbrown.github.io/umpire/extensions/json/) · [Quick Start](https://sdougbrown.github.io/umpire/learn/)

## Install

```bash
npm install @umpire/core @umpire/dsl @umpire/json
```

## Usage

```ts
import { check, enabledWhen, umpire } from '@umpire/core'
import { namedValidators, fromJson, toJson } from '@umpire/json'

const schema = {
  version: 1,
  fields: {
    email: { isEmpty: 'string' },
    submit: {},
  },
  rules: [],
  validators: {
    email: { op: 'email', error: 'Enter a valid email address' },
  },
}

const { fields, rules, validators } = fromJson(schema)

const mergedRules = [
  ...rules,
  enabledWhen('submit', check('email', namedValidators.email()), {
    reason: 'Enter a valid email address',
  }),
]

const ump = umpire({
  fields,
  rules: mergedRules,
  validators,
})

const json = toJson({
  fields,
  rules: mergedRules,
  validators,
})
```

## API

### `fromJson(schema)`

Parses a portable Umpire JSON schema into `{ fields, rules, validators }` values you can pass into `umpire()` or compose with hand-written rules.

### `toJson({ fields, rules, validators, conditions })`

Serializes a TypeScript config back into the portable JSON contract.

- Rules hydrated from JSON round-trip exactly
- Validators hydrated from JSON round-trip exactly
- Hand-written rules serialize when they map cleanly to the contract
- Hand-written validators serialize when they use portable validator metadata
- Unsupported pieces go into `excluded` instead of disappearing

### `namedValidators.*()`

Named validators for use with `check(field, validator)` and JSON `validators`:

- `namedValidators.email()`
- `namedValidators.url()`
- `namedValidators.matches(pattern)`
- `namedValidators.minLength(n)`
- `namedValidators.maxLength(n)`
- `namedValidators.min(n)`
- `namedValidators.max(n)`
- `namedValidators.range(min, max)`
- `namedValidators.integer()`

Use these when you want a validator or check-backed rule to survive the JSON boundary. Plain functions, regexes, and library schemas still work at runtime, but they stay TypeScript-specific.

### `expr.check()` and JSON-aware builders

`expr.check()` is JSON-specific and remains in `@umpire/json`.

Use it with JSON-aware builders such as `enabledWhenExpr`, `requiresExpr`, `disablesExpr`, and `fairWhenExpr` when a rule must round-trip through JSON.

For non-`check` expression authoring and compilation, import from `@umpire/dsl`.

## `validators`

Use top-level `validators` for field-local correctness checks that should surface `valid` / `error` through `ump.check()`:

```json
{
  "validators": {
    "email": { "op": "email", "error": "Enter a valid email address" }
  }
}
```

This is the first-class validation path in `@umpire/json`.

Top-level `"check"` rules still exist for legacy compatibility, but they remain structural fairness rules rather than validator metadata.

## `excluded`

`excluded` is the escape hatch for rules or field semantics that cannot be serialized safely. It is informational only. Its job is to tell the next runtime, "there was more logic here, and you'll need to recreate it natively."

When present, `excluded.key` gives an exclusion a stable identity so later serializations can replace or remove it once that slot becomes portable.

## Docs

- [@umpire/json docs](https://sdougbrown.github.io/umpire/extensions/json/)
- [Composing with Validation](https://sdougbrown.github.io/umpire/concepts/validation/)
- [check() helper](https://sdougbrown.github.io/umpire/api/rules/check/)
