---
title: '@umpire/async'
description: Async predicates, async validators, and built-in cancellation — a superset of @umpire/core for rules that need to leave the call stack.
---

Most rules evaluate synchronously — they inspect the current values and return a result immediately. But some policy questions can't be answered from data already in memory: is this email address available? Does this account's plan allow teams? Do these values satisfy a uniqueness constraint before you write to the database?

`@umpire/async` extends `@umpire/core` so that predicates and validators can return Promises. Every rule builder accepts both sync and async predicates. Sync rules from `@umpire/core` can be passed alongside async ones — they're wrapped transparently, and evaluation always proceeds in topological order.

The cost: `check()`, `play()`, `scorecard()`, and `challenge()` all return Promises. If all your predicates are synchronous, stay on `@umpire/core` — it evaluates in a single pass and `check()` returns a value, not a thenable.

## Install

```bash
npm install @umpire/async
```

## When to use this

Reach for `@umpire/async` when at least one of your rules needs to:

- Call an external API (plan status, feature flags, remote configuration)
- Query a database (uniqueness checks, record existence, permission lookups)
- Run a validator that returns a Promise (Zod schemas with async refinements, custom async checks)
- Model server-side policy where the inputs come from an HTTP request, not a form

If none of your predicates leave the call stack, `@umpire/core` is sufficient.

## Quick start

```ts
import { umpire, enabledWhen, requires, fairWhen } from '@umpire/async'

const ump = umpire({
  fields: {
    email:    { required: true },
    password: { required: true },
    teamName: {},
  },
  rules: [
    // async predicate — answers a question that needs a round trip
    enabledWhen('teamName', async (_values, conditions) => {
      const plan = await fetchPlan(conditions.accountId)
      return plan.allowsTeams
    }, { reason: 'Upgrade your plan to enable team features' }),

    // sync rule mixed in freely — wrapped transparently
    requires('teamName', 'email'),
  ],
})

const availability = await ump.check(values, { accountId: req.user.accountId })
// availability.teamName.enabled — false until plan check resolves true
// availability.teamName.reason  — 'Upgrade your plan to enable team features'
```

## Scenarios

### Server-side policy with remote lookups

Account settings, feature gates, and admin forms often depend on plan data or permissions that aren't in the request body. With `@umpire/core`, you'd fetch that data before constructing rules, or thread it through `conditions`. With `@umpire/async`, the fetch happens inside the predicate — the rule itself owns the question.

A settings endpoint where field availability depends on the caller's account plan:

```ts
import { umpire, enabledWhen } from '@umpire/async'
import { fetchPlan } from './plans'

const settingsUmp = umpire({
  fields: {
    teamSize:         {},
    ssoProvider:      {},
    auditRetention:   {},
    customDomain:     {},
  },
  rules: [
    enabledWhen('teamSize', async (_v, c) => {
      const plan = await fetchPlan(c.accountId)
      return plan.allowsTeams
    }, { reason: 'Team size requires a Team or Enterprise plan' }),

    enabledWhen('ssoProvider', async (_v, c) => {
      const plan = await fetchPlan(c.accountId)
      return plan.hasSso
    }, { reason: 'SSO is available on Enterprise plans' }),

    enabledWhen('auditRetention', async (_v, c) => {
      const plan = await fetchPlan(c.accountId)
      return plan.auditRetentionDays > 0
    }, { reason: 'Audit log retention requires an Enterprise plan' }),
  ],
})

// In your endpoint handler:
const availability = await settingsUmp.check(req.body, { accountId: req.user.accountId })

for (const [field, status] of Object.entries(availability)) {
  if (!status.enabled && req.body[field] !== undefined) {
    return res.status(422).json({ error: status.reason })
  }
}

await db.update(settings).set(req.body).where(eq(settings.accountId, req.user.accountId))
```

The three `fetchPlan` calls run in parallel — gate rules for each field fire concurrently within the evaluation pass.

### Async validation with Zod

Zod schemas support async refinements via `safeParseAsync`. Any Zod schema satisfies `@umpire/async`'s `AsyncSafeParseValidator` interface, so you can pass it directly as a validator.

```ts
import { umpire, enabledWhen } from '@umpire/async'
import { z } from 'zod'

// A Zod schema with an async uniqueness refinement
const emailSchema = z.string().email().refine(
  async (email) => {
    const taken = await db.query.users.findFirst({ where: eq(users.email, email) })
    return !taken
  },
  { message: 'Email is already registered' },
)

const signupUmp = umpire({
  fields: {
    email:       { required: true },
    password:    { required: true },
    companyName: {},
  },
  rules: [
    enabledWhen('companyName', (_v, c) => c.plan === 'business'),
  ],
  validators: {
    email: emailSchema,           // safeParseAsync called automatically
    password: {
      validator: z.string().min(8, 'Password must be at least 8 characters'),
      error: 'Password too short',
    },
  },
})

const availability = await signupUmp.check(values, { plan: account.plan })
// availability.email.valid  → false if email is taken
// availability.email.error  → 'Email is already registered'
// availability.password.valid → false if under 8 chars
```

Validators only run on fields that are both enabled and satisfied — a disabled `companyName` field generates no validation result, and an empty `email` field is not validated until it has a value.

The availability-first design is intentional. Schema validation answers "is this value well-formed?" Umpire availability answers "should this field exist at all?" Both questions matter; neither replaces the other.

### Before writing to the database

When your Umpire instance is defined with async rules, it integrates naturally into a pre-write check at the service layer. The pattern: derive fields from your Drizzle schema, add async rules that enforce business policy (including constraints that require a round trip), then `await ump.check()` before `db.insert()`.

```ts
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core'
import { umpire, enabledWhen, requires, fairWhen } from '@umpire/async'
import { fromDrizzleTable } from '@umpire/drizzle'
import { db } from './db'
import { eq } from 'drizzle-orm'

const users = pgTable('users', {
  id:          serial().primaryKey(),
  email:       varchar({ length: 255 }).notNull(),
  accountType: text({ enum: ['personal', 'business'] }).notNull().default('personal'),
  companyName: text(),
  domain:      text(),
})

const base = fromDrizzleTable(users)

export const userUmp = umpire({
  fields: base.fields,
  rules: [
    ...base.rules,

    // sync availability rules
    enabledWhen('companyName', (v) => v.accountType === 'business'),
    requires('companyName', (v) => v.accountType === 'business'),
    enabledWhen('domain', (v) => v.accountType === 'business'),

    // async fairness check — runs a uniqueness query before insert
    fairWhen('email', async (email) => {
      const existing = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
      return existing.length === 0
    }, { reason: 'Email is already registered' }),
  ],
})

// In your POST /users endpoint:
export async function createUser(req, res) {
  const availability = await userUmp.check(req.body)

  const problems: string[] = []

  for (const [field, status] of Object.entries(availability)) {
    if (status.enabled && status.required && !status.satisfied) {
      problems.push(status.reason ?? `${field} is required`)
    }
    if (status.enabled && status.fair === false) {
      problems.push(status.reason ?? `${field} is invalid`)
    }
    if (!status.enabled && req.body[field] != null) {
      problems.push(status.reason ?? `${field} is not allowed`)
    }
  }

  if (problems.length > 0) {
    return res.status(422).json({ errors: problems })
  }

  await db.insert(users).values(req.body)
  return res.status(201).json({ ok: true })
}
```

`fairWhen` is the right rule for a uniqueness check: the field is enabled, a value has been provided, and the question is whether that value is appropriate for the current state. If the email is taken, the field is marked foul and `availability.email.reason` carries the message — no ad-hoc error tracking needed.

The `fromDrizzleTable` call is unchanged. `@umpire/async` accepts the same `fields` and `rules` shape as `@umpire/core`; you are only switching the `umpire()` import.

## Cancellation

Async evaluation can be interrupted. `@umpire/async` has first-class cancellation at three layers.

### Auto-cancel

Starting a new `check()` on the same instance automatically cancels any in-flight check. The cancelled Promise rejects with an `AbortError`. This keeps evaluation consistent when values change faster than rules resolve — only the latest call matters.

```ts
const first = ump.check(staleValues)   // starts immediately
const result = await ump.check(freshValues)  // cancels first, resolves second

// Suppress the AbortError from the cancelled check
await first.catch(() => {})
```

### External signal

Pass an `AbortSignal` to cancel from outside — on route navigation, component unmount, or request timeout.

```ts
const controller = new AbortController()

// In a framework cleanup hook:
onDestroy(() => controller.abort())

const availability = await ump.check(values, conditions, undefined, controller.signal)
```

`play()` accepts a signal as its third argument. `scorecard()` accepts `options.signal`. `challenge()` does not support external cancellation — it uses an internal non-cancellable signal.

### onAbort

The `onAbort` option on `umpire()` fires whenever a check is cancelled, whether by auto-cancel or an external signal. Use it to clear loading state.

```ts
const ump = umpire({
  fields: { ... },
  rules: [ ... ],
  onAbort: (reason) => {
    setIsChecking(false)
  },
})
```

If `onAbort` throws, the error is swallowed — it will not produce an unhandled rejection.

## Mixing sync and async rules

Rules from `@umpire/core` can be passed directly alongside rules from `@umpire/async`. The sync rules are wrapped with a trivial adapter that resolves their result as a Promise — no behavior change.

```ts
import { requires, enabledWhen } from '@umpire/core'
import { umpire, fairWhen } from '@umpire/async'

const ump = umpire({
  fields: { ... },
  rules: [
    requires('companyName', 'accountType'),             // @umpire/core
    enabledWhen('companyName', (v) => v.accountType === 'business'),  // @umpire/core
    fairWhen('email', async (email) => checkEmailFree(email)),         // @umpire/async
  ],
})
```

Topological order is preserved regardless of which package a rule comes from. A sync rule that runs before an async rule still executes before it in the evaluation graph.

## Async validators

The `validators` option accepts any of these shapes per field:

```ts
// Async function — return boolean or { valid, error? }
type AsyncValidationFunction<T> = (value: NonNullable<T>) => boolean | Promise<boolean | { valid: boolean; error?: string }>

// Object with safeParseAsync — satisfied by any Zod schema
type AsyncSafeParseValidator<T> = {
  safeParseAsync(value: NonNullable<T>): Promise<{ success: boolean }>
}
```

All sync validator shapes from `@umpire/core` also work: plain functions returning `boolean`, objects with `safeParse`, objects with `test`, and named checks.

Wrap any validator in `{ validator, error }` to override its error message:

```ts
validators: {
  email: {
    validator: emailSchema,
    error: 'That address is already in use',
  },
}
```

Validators run concurrently via `Promise.all` across all enabled, satisfied fields. They respect the `AbortSignal` passed to `check()` — if the check is cancelled mid-validation, the validator race is abandoned.

After `check()` resolves, validated fields carry `valid: boolean` and, when invalid, `error?: string` on their availability entry.

## API

### `umpire(config)`

```ts
import { umpire } from '@umpire/async'

umpire({
  fields:      FInput,                         // same as @umpire/core
  rules:       AnyRule[],                      // sync (@umpire/core) or async, mixed freely
  validators?: AnyValidationMap,               // sync or async validators per field
  onAbort?:    (reason?: unknown) => void,     // called on check cancellation
}): Umpire
```

### Rule builders

All builders accept predicates that return `boolean | Promise<boolean>`. The `reason` option also accepts `(values, conditions) => string | Promise<string>`.

| Builder | Controls |
|---------|----------|
| `enabledWhen(field, predicate, options?)` | enabled |
| `fairWhen(field, predicate, options?)` | fair |
| `requires(field, ...deps, options?)` | enabled (via dependency satisfaction) |
| `disables(source, targets[], options?)` | enabled (inverse) |
| `oneOf(groupName, branches, options?)` | enabled (mutual exclusion) |
| `anyOf(...rules)` | enabled or fair (OR combinator, parallel) |
| `eitherOf(groupName, branches)` | enabled or fair (OR across branches, parallel) |
| `check(field, validator)` | predicate builder — accepts async validators |
| `createRules<F, C>()` | returns all builders typed to your fields and conditions |
| `defineRule(config)` | low-level escape hatch for custom async evaluation |

### Instance methods

```ts
// Async — return Promises
check(values, conditions?, prev?, signal?): Promise<AvailabilityMap<F>>
play(before: Snapshot<C>, after: Snapshot<C>, signal?): Promise<Foul<F>[]>
scorecard(snapshot, options?): Promise<ScorecardResult<F, C>>
challenge(field, values, conditions?, prev?): Promise<ChallengeTrace>

// Synchronous
init(overrides?): FieldValues<F>
graph(): UmpireGraph
rules(): AsyncRuleEntry<F, C>[]
```

`scorecard()` accepts `options.signal` for external cancellation. `challenge()` does not.

`check()` accepts partial values — fields not present in the values object are treated as unsatisfied. Pass `prev` when rules inspect the previous state (as `oneOf` transition logic does).

## See also

- [`@umpire/write`](/extensions/write/) — create and patch checks at the service boundary; pair with an async umpire instance for async policy
- [`@umpire/drizzle`](/adapters/database/drizzle/) — derive fields from Drizzle table definitions; use `umpire` from `@umpire/async` to add async rules
- [`@umpire/zod`](/adapters/validation/zod/) — Zod adapter; Zod schemas satisfy `AsyncSafeParseValidator` and work directly in `validators`
- [`check()`](/api/check/) — the sync counterpart in `@umpire/core`
- [Composing Validation](/concepts/validation/) — where availability policy fits in a layered validation strategy
