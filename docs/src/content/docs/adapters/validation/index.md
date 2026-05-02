---
title: Validator Integrations
description: How Umpire's availability map connects to schema-based validation libraries like Zod, Yup, and Valibot.
---

Umpire decides which fields are active. Validation libraries decide whether their values are correct. Validator integrations are the glue between the two: they read the availability map and build a schema that reflects the current shape of your data.

## The contract

A validator integration does three things:

1. **Skip disabled fields** — fields where `enabled: false` are not in play. Excluded from the schema entirely. A validation library should never produce errors for them.
2. **Respect required/optional** — `status.required` from Umpire overrides your static schema definition. A field can be declared `required: true` in the engine config but report `required: false` when disabled.
3. **Optionally reject foul values** — fields where `fair: false` hold values that are structurally valid but contextually wrong. On a server, you can choose to reject those submissions rather than accept them.

## Client vs server usage

On the **client**, you call `engine.check(values)` during the render cycle and pass the resulting availability map to your validator. The derived schema changes as the user changes fields.

On the **server**, the same pattern acts as a guard. The incoming request body drives `engine.check()`, which returns the same availability map the client would have produced for that data. Any inconsistency — a required field missing, a foul value present — fails validation.

```ts
// Shared — same engine on client and server
export const engine = umpire({ fields, rules })
export const schemas = { /* per-field schemas */ }

// Server handler
const body = await req.json()
const availability = engine.check(body)
const schema = deriveSchema(availability, schemas, { rejectFoul: true })
const result = schema.safeParse(body)
```

`engine.check()` is deterministic: the same values produce the same availability map. If the client and server share the engine definition, they will always agree on which fields are enabled and required.

## Foul values and server guards

`fairWhen()` rules mark a field `fair: false` when its current value is no longer appropriate for the context — a selection that was valid before something else changed. On a form this is shown as an error the user needs to correct. On a server it means the submission contains a value that the client should have caught.

The `rejectFoul` option handles this:

```ts
// Without rejectFoul (default) — foul values pass base schema, behave like fair fields
deriveSchema(availability, schemas)

// With rejectFoul — foul fields get an always-failing refinement
deriveSchema(availability, schemas, { rejectFoul: true })
```

When `rejectFoul: true`:
- An enabled field with `fair: false` and a present value fails with the field's `reason` as the error message.
- An enabled field with `fair: false` that is absent (optional, no value submitted) passes — only present foul values are rejected.

## The pattern for other libraries

The same three-step logic maps to any schema library:

```ts
// Generic pseudocode — works for Zod, Yup, Valibot, Joi, etc.
for (const [field, status] of Object.entries(availability)) {
  if (!status.enabled) continue                     // skip disabled

  const base = schemas[field]
  if (!base) continue

  if (rejectFoul && !status.fair) {
    const refined = base.alwaysFail(status.reason)  // library-specific
    shape[field] = status.required ? refined : refined.optional()
    continue
  }

  shape[field] = status.required ? base : base.optional()
}
```

Each library's "always-fail with message" primitive:

| Library  | Expression |
|----------|-----------|
| Zod      | `.refine(() => false, { message })` |
| Effect   | `.pipe(Schema.filter(() => false, { message: () => message }))` |
| Yup      | `.test('foul', message, () => false)` |
| Valibot  | `check(() => false, message)` |
| Joi      | `.custom(() => { throw new Error(message) })` |

`@umpire/zod` is the reference implementation. `@umpire/effect` follows the same contract for Effect Schema. Future packages like `@umpire/yup` or `@umpire/valibot` would follow the same pattern.

## See also

- [`@umpire/zod`](/adapters/validation/zod/) — reference implementation
- [`@umpire/effect`](/adapters/validation/effect/) — Effect Schema adapter and SubscriptionRef bridge
- [Composing with Validation](/concepts/validation/) — manual patterns and the `check()` bridge
- [`fairWhen()`](/api/rules/fair-when/) — the rule that produces `fair: false`
