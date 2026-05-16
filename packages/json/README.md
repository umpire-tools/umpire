# @umpire/json

Portable schema parsing and serialization for [@umpire/core](https://www.npmjs.com/package/@umpire/core), plus portable `namedValidators.*()` helpers that round-trip cleanly through JSON.

`@umpire/dsl` now owns the pure expression layer (`Expr`, `expr.*`, `compileExpr()`, `getExprFieldRefs()`).
`@umpire/json` owns the JSON-aware additions: `expr.check()`, `namedValidators.*()`, and portable JSON rule builders.

[Docs](https://umpire.tools/extensions/json/) · [Quick Start](https://umpire.tools/learn/)

## Install

```bash
npm install @umpire/core @umpire/dsl @umpire/json
```

## Which API?

- Loading a schema from a server or database — `fromJsonSafe(raw)`
- Extending a parsed schema with app-specific TypeScript rules — `fromJson(schema)` + hand-written rules
- Building rules that must round-trip through JSON — `namedValidators.*()` + `*Expr` builders + `toJson()`

## Usage

The minimum path: validate and hydrate with `fromJsonSafe()`, guard the result, then pass the pieces into `umpire()`.

```ts
import { umpire } from '@umpire/core'
import { fromJsonSafe } from '@umpire/json'

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

const result = fromJsonSafe(schema)

if (!result.ok) {
  console.error(result.errors)
  return
}

const ump = umpire({
  fields: result.fields,
  rules: result.rules,
  validators: result.validators,
})
console.log(ump.check({ email: 'user@example.com', submit: null }))
```

### Composing with hand-written rules

When most of your schema lives in JSON but a few rules require app-specific TypeScript logic, hydrate the JSON portion first, then spread the parsed rules alongside your hand-written ones in the same `umpire()` call. Hydrated rules and hand-written rules coexist without conflict — `umpire()` sees a single flat array and evaluates them together.

```ts
import { check, enabledWhen, umpire } from '@umpire/core'
import { namedValidators, fromJson } from '@umpire/json'

const { fields, rules, validators } = fromJson(schema)

const ump = umpire({
  fields,
  rules: [
    ...rules,
    enabledWhen('submit', check('email', namedValidators.email()), {
      reason: 'Enter a valid email address',
    }),
  ],
  validators,
})
```

### Authoring for portability

When rules need to cross a runtime boundary — stored in a database, sent from a server, loaded in a different language — build them through the portable builders.

```ts
import { umpire } from '@umpire/core'
import {
  namedValidators,
  enabledWhenExpr,
  expr,
  toJson,
  fromJson,
} from '@umpire/json'

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
  enabledWhenExpr('submit', expr.check('email', namedValidators.email()), {
    reason: 'Enter a valid email address',
  }),
]

const ump = umpire({ fields, rules: mergedRules, validators })

// Round-trips cleanly — enabledWhenExpr carries its own JSON definition
const json = toJson({ fields, rules: mergedRules, validators })
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

- [@umpire/json docs](https://umpire.tools/extensions/json/)
- [Composing with Validation](https://umpire.tools/concepts/validation/)
- [check() helper](https://umpire.tools/api/rules/check/)
