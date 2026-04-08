---
title: '@umpire/json'
description: Parse portable Umpire schemas, serialize TypeScript configs, and use named checks that round-trip cleanly.
---

`@umpire/json` is Umpire's portability layer.

It does two related jobs:

- `fromJson()` turns a JSON schema into `{ fields, rules }` that you can pass straight into `umpire()`
- `toJson()` turns a TypeScript config back into the portable JSON contract

That makes it useful both for server-generated UIs and for sharing the same Umpire model across runtimes.

## Install

```bash
yarn add @umpire/core @umpire/json
```

## `fromJson(schema)`

`fromJson()` parses a portable schema into normal Umpire field definitions and rules.

```ts
import { umpire } from '@umpire/core'
import { fromJson } from '@umpire/json'

const { fields, rules } = fromJson(schema)

const ump = umpire({
  fields: {
    ...fields,
    debugNotes: {},
  },
  rules: [
    ...rules,
  ],
})
```

The parsed rules stay composable. You can hydrate most of the form from JSON, then add a few hand-written rules for app-specific behavior in the same `umpire()` call.

## `toJson({ fields, rules, conditions })`

`toJson()` walks a TypeScript config and writes back the parts that fit the portable contract.

```ts
import { toJson } from '@umpire/json'

const json = toJson({
  fields,
  rules,
  conditions,
})
```

Two important behaviors:

- Rules hydrated by `fromJson()` round-trip exactly
- Hand-written rules are serialized when they map cleanly to the JSON contract. Anything else goes into `excluded` instead of being silently dropped

When the config started life in `fromJson()`, previously declared `conditions` and `excluded` entries are carried forward too. If the current runtime now knows how to serialize one of those excluded slots, `toJson()` replaces the old exclusion instead of duplicating it.

That second part is deliberate. The JSON should stay honest about what another runtime can and cannot reconstruct.

## Portable checks

`@umpire/json` also exports named `checks.*()` helpers:

```ts
import { check, enabledWhen } from '@umpire/core'
import { checks } from '@umpire/json'

enabledWhen('submit', check('email', checks.email()), {
  reason: 'Enter a valid email address',
})
```

These behave like the validator forms `check()` already accepts, but they carry stable metadata so `toJson()` can serialize them and `fromJson()` can rebuild them later.

If you only care about TypeScript runtime behavior, plain functions, regexes, Zod schemas, and Yup schemas are still fine. If you want a rule to survive the JSON boundary, prefer `checks.*()`.

Built-in named checks in `version: 1`:

- `checks.email()` — practical email syntax check
- `checks.url()` — absolute URL with a scheme
- `checks.matches(pattern)` — regex match from a serializable pattern string
- `checks.minLength(n)` — string or array length must be at least `n`
- `checks.maxLength(n)` — string or array length must be at most `n`
- `checks.min(n)` — number must be at least `n`
- `checks.max(n)` — number must be at most `n`
- `checks.range(min, max)` — number must fall within an inclusive range
- `checks.integer()` — number must be an integer

Each one is still just a validator. The surrounding rule owns the final reason string, so you can keep the portable check and still tailor the message for your product.

## What JSON `"check"` means

In TypeScript, `check()` is still just a predicate factory. It remembers which field to read and turns a validator into something rule helpers can consume.

In the JSON contract, `"type": "check"` means "apply this named value constraint to this field." `@umpire/json` compiles that entry back into the equivalent Umpire behavior when it hydrates the schema.

That does not replace conditions or make `check` a standalone core rule type. It is just the portable form of a common `check(field, validator)` pattern.

## Conditions

Conditions are declared inputs that the consuming runtime must provide:

```json
{
  "conditions": {
    "isAdmin": { "type": "boolean" },
    "validPlans": { "type": "string[]" }
  }
}
```

Use them for external state such as account tier, feature flags, auth state, or server-provided option sets.

## `excluded`

Some rules are too app-specific to serialize safely. When that happens, `toJson()` records them in `excluded`:

```json
{
  "excluded": [
    {
      "type": "fairWhen",
      "field": "motherboard",
      "description": "Predicate requires runtime domain logic"
    }
  ]
}
```

`excluded` is informational. No runtime evaluates it automatically. Its job is to tell the next implementation, "there was more logic here, and you'll need to recreate it natively."

When present, `excluded.key` gives that exclusion a stable identity so later serializations can replace or remove it if another runtime implements the same slot directly.

## Portable field semantics

Field defaults stay primitive-only in the JSON contract: string, number, boolean, or `null`.

For `isEmpty`, the portable strategy names are intentionally small:

- `'present'` — default Umpire semantics (`null` and `undefined` are empty)
- `'string'`
- `'array'`
- `'object'`
- `'number'`
- `'boolean'`

In TypeScript, common empty-state helpers like `isEmptyString`, `isEmptyArray`, and `isEmptyObject` from `@umpire/core` round-trip cleanly through those strategies.

## See also

- [Composing with Validation](/umpire/concepts/validation/) — where `check()` fits conceptually
- [check() helper](/umpire/api/rules/check/) — validator shapes in core
