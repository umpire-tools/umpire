---
title: '@umpire/write'
description: Policy-level create and patch checks for service boundaries — answers whether a candidate passes Umpire availability rules before you persist it.
---

#### The problem

At the form layer, Umpire tells your UI which fields are available so it can render the right controls. At the service layer, you need the inverse: given a payload that arrived at your endpoint, does it respect the same policy? A form can enforce availability visually, but direct API clients, scripts, and mobile apps can submit anything. `@umpire/write` applies your Umpire instance against an incoming create or patch payload and returns a single pass/fail answer, a structured list of violations, and the normalized candidate that would be persisted.

#### Why not schema validation?

Schema validation is a different check. A Zod schema tells you the payload has the right shape and types — it cannot tell you whether a field should be present at all given the current state of other fields. Availability policy is dynamic: a field that is required when one option is selected may be disabled when another is. `@umpire/write` is the layer that enforces those relationships at the service boundary, after schema validation has already passed.

#### Example

Consider a user-settings endpoint: a feature flag on the account controls which fields are available, and some fields become disabled when others are set. Your form already uses `ump.check()` to render conditionally, but a mobile client or a data migration script bypasses the form entirely. Before you call `db.update()`, you want the same policy evaluation your form relies on — with a clear `ok: false` and a reason string you can return in the response body.

## Install

```bash
yarn add @umpire/core @umpire/write
```

## `checkCreate(ump, data, context?)`

Call this when you are creating a new record from an incoming payload.

```ts
import { checkCreate } from '@umpire/write'

const result = checkCreate(ump, req.body, { tenantId: req.user.tenantId })
if (!result.ok) {
  return res.status(422).json({ errors: result.errors })
}
await db.insert(result.candidate)
```

The candidate is built as `{ ...ump.init(), ...data }`. Umpire defaults fill in any fields the payload omitted; the incoming data then overlays them. Extra keys on `data` that are not declared in the Umpire field set pass through onto `result.candidate` untouched, but they are not evaluated for policy.

`result.ok` is `true` when there are no current-state issues. Create results never include transition fouls — `result.fouls` is always `[]`.

Explicit `undefined` values on `data` are treated as real assignments. A payload `{ name: undefined }` produces a candidate with `name` present but undefined, and a required field in that state will produce a `required` issue.

## `checkPatch(ump, existing, patch, context?)`

Call this when you are updating an existing record from a partial payload.

```ts
import { checkPatch } from '@umpire/write'

const existing = await db.findOne(id)
const result = checkPatch(ump, existing, req.body, { tenantId: req.user.tenantId })
if (!result.ok) {
  return res.status(422).json({ errors: result.errors, fouls: result.fouls })
}
await db.update(id, result.candidate)
```

The candidate is `{ ...existing, ...patch }` — a shallow merge where patch keys win. `existing` is also passed to `ump.check()` as the previous state, which matters for rules like `oneOf` that resolve strategy conflicts by considering what the record held before the patch. Without that previous-state context, the same candidate can resolve to a different availability map.

`checkPatch` computes two independent sets of violations:

- **Issues** — current-state problems on the merged candidate, the same evaluation `checkCreate` performs.
- **Fouls** — transition problems detected by `play()`. A foul means a field held a value in `existing`, and the patch caused that field to become disabled or foul while the value is still present. This catches the case where a dependent field becomes stale because the field it depends on was cleared.

`result.ok` is `true` only when there are no issues **and** no fouls. A patch that produces clean issues but transition fouls is still `ok: false`.

`result.errors` contains only current-state issue messages. Transition foul details stay on `result.fouls`, where each entry includes a `field`, a `reason`, and a `suggestedValue` for the reset.

Extra keys from either `existing` or `patch` that are not in the Umpire field set pass through onto `result.candidate`, but only declared fields are evaluated for policy or transitions.

## Result shape

```ts
type WriteCheckResult<F extends Record<string, FieldDef>> = {
  ok: boolean
  candidate: WriteCandidate<F>
  availability: AvailabilityMap<F>
  issues: WriteIssue<F>[]
  fouls: Foul<F>[]
  errors: string[]
}

type WriteIssue<F extends Record<string, FieldDef>> = {
  kind: 'required' | 'disabled' | 'foul'
  field: keyof F & string
  message: string
}
```

Issues are derived only from fields declared in the Umpire instance. At most one issue is emitted per field, checked in this order:

1. **`required`** — the field is enabled, required, and unsatisfied.
2. **`disabled`** — the field has a value and is disabled. Empty disabled fields are not issues; a field that is disabled and unsatisfied is simply not in play.
3. **`foul`** — the field has a value, is enabled, and `fair` is `false`.

The `message` for each issue comes from the field's `reason` in the availability status, falling back to the first entry in `reasons`, then to a generated fallback (`"${field} is required"`, `"${field} is disabled"`, or `"${field} is foul"`).

## Issues vs fouls

`issues` and `fouls` report different problems:

- **Issues** are current-state violations — the candidate has a field that is required but missing, disabled but filled, or enabled but foul. These are derived from the availability snapshot and apply to both creates and patches.
- **Fouls** are transition violations — a field held a value before the patch, and after the patch it became disabled or foul while still holding that value. These are computed by `play()` and only appear in `checkPatch` results (create results always have `fouls: []`).

A patch can be `ok: false` due to issues, fouls, or both. Inspect both lists to understand why.

## Boundary

`result.ok` means the candidate passes Umpire write policy only. It does not mean the input is:

- schema-valid (type constraints, format rules, string lengths)
- authorized for the caller
- safe to persist (unique constraints, foreign keys, generated columns)
- accepted by your database

Schema, authorization, and database constraints belong at the persistence boundary — in your ORM hooks, repository layer, or a dedicated validation pipe. `@umpire/write` checks policy availability; your persistence layer checks structural validity.

## ORM integration

When you pass `result.candidate` toward persistence, remember that it is Umpire-normalized input. Defaults come from `ump.init()`, not from your ORM or database. A field that Umpire defaults to `null` might receive an auto-generated UUID from your database on insert. That difference is intentional — Umpire governs availability policy, your ORM governs storage semantics.

Practical guidance for common ORMs:

- **Sequelize:** run `checkCreate`/`checkPatch` before `Model.create()` or `instance.update()`. Apply Sequelize defaults, hooks, and validators after the Umpire check passes. Use `result.candidate` as the initial payload, not the final one.
- **Drizzle:** check the candidate before your `db.insert()` or `db.update()` call. Drizzle's schema-level defaults and constraints apply at the SQL layer — Umpire policy and Drizzle validation are independent checks.
- **Prisma:** check the candidate before `prisma.model.create()` or `prisma.model.update()`. Prisma's own validation, `@default` attributes, and unique constraints run when the query hits the database. Umpire policy is your pre-flight check; Prisma is your persistence guard.

In all cases, the pattern is the same: Umpire first, ORM second. Reject early on policy violations, then let the ORM enforce its own rules.

## See also

- [`ump.check()`](/api/check/) — the availability API that `checkCreate`/`checkPatch` wrap
- [`play()`](/api/play/) — transition foul computation used by `checkPatch`
- [Composing Validation](/concepts/validation/) — where Umpire fits in a layered validation strategy
