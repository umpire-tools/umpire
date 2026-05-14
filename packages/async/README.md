# @umpire/async

Async-aware field-availability engine — a superset of [@umpire/core](https://www.npmjs.com/package/@umpire/core) where predicates and validators can return Promises. Use this package when any of your availability rules need to reach outside the current call stack: a remote config check, a debounced uniqueness query, or a permission lookup that requires a round trip.

If all your predicates are synchronous, stay on `@umpire/core` — it's lighter and its `check()` returns a value, not a Promise.

[Docs](https://umpire.tools/) · [Quick Start](https://umpire.tools/learn/)

## Install

```bash
npm install @umpire/async
```

`@umpire/core` is a peer dependency and is included automatically when you install `@umpire/async` through npm or yarn.

## Quick example

A signup form where username availability is verified against an API before the submit button becomes enabled:

```ts
import { umpire, enabledWhen, requires, fairWhen } from '@umpire/async'

const ump = umpire({
  fields: {
    email: { required: true },
    password: { required: true },
    username: { required: true },
    referralCode: {},
  },
  rules: [
    // async predicate — checks the server for username availability
    enabledWhen(
      'username',
      async (values, conditions) => {
        if (!values.email) return false
        const taken = await checkUsernameTaken(values.username)
        return !taken
      },
      { reason: 'username is already taken' },
    ),

    // sync rule from @umpire/async — mixed freely with async rules
    requires('referralCode', (values) =>
      values.email?.endsWith('@invite.example.com'),
    ),
  ],
})

const availability = await ump.check(values)
// availability.username.enabled — false if username is taken
// availability.referralCode.enabled — true only for invited email domains
```

Sync rules from `@umpire/core` can also be passed into `rules` — they are wrapped transparently.

## When to use this

Reach for `@umpire/async` when:

- A predicate needs to call an API, query a database, or perform any I/O
- A validator must resolve asynchronously (e.g. a Zod schema with `.safeParseAsync()`)
- You want built-in cancellation — starting a new `check()` auto-cancels the previous one

All evaluation methods (`check`, `play`, `scorecard`, `challenge`) return Promises. That overhead is intentional: it lets async and sync rules compose uniformly. If that tradeoff isn't worth it for your case, `@umpire/core` evaluates synchronously and has a smaller footprint.

`@umpire/async` is not a store adapter, a React hook, or a state manager. It evaluates what you pass it. For reactive bindings use `@umpire/react`, `@umpire/signals`, or one of the store adapters.

## API

### `umpire(config)`

```ts
umpire({
  fields: FInput,
  rules: AnyRule[],
  validators?: AnyValidationMap,
  onAbort?: (reason?: unknown) => void,
}): Umpire
```

- **`fields`** — same shape as `@umpire/core`. Each key is a field name; the value is a `FieldDef` (`required`, `default`, `isEmpty`).
- **`rules`** — array of async rules from `@umpire/async` builders, sync rules from `@umpire/core`, or both. Mixed freely.
- **`validators`** — optional per-field validators. Accepts sync validators (functions, `safeParse`, `test`, named checks) and async ones (`AsyncValidationFunction`, `AsyncSafeParseValidator`).
- **`onAbort`** — optional hook called whenever a `check()` is cancelled, either by auto-cancel or an external `AbortSignal`. The abort reason is passed as the first argument. If this function throws, the error is swallowed — it will not cause an unhandled rejection.

Returns an `Umpire` instance.

### Rule builders

All builders return `AsyncRule` and accept both sync and async predicates.

#### `enabledWhen(field, predicate, options?)`

Makes `field` enabled only when `predicate` returns (or resolves to) `true`. When it returns `false`, the field is disabled and `reason` is attached.

```ts
type predicate = (
  values: FieldValues,
  conditions: C,
) => boolean | Promise<boolean>
```

```ts
enabledWhen(
  'teamSize',
  async (_values, conditions) => {
    const plan = await fetchPlan(conditions.accountId)
    return plan.allowsTeams
  },
  { reason: 'upgrade to a team plan to set team size' },
)
```

#### `fairWhen(field, predicate, options?)`

Marks the current value of `field` as foul when `predicate` returns `false`. Only evaluated when the field is satisfied — an empty field is always fair. The predicate receives the current value, the full values map, and conditions.

```ts
type predicate = (
  value: NonNullable<V>,
  values: FieldValues,
  conditions: C,
) => boolean | Promise<boolean>
```

```ts
fairWhen(
  'email',
  async (email) => {
    const domain = email.split('@')[1]
    return checkDomainValid(domain)
  },
  { reason: 'email domain is not reachable' },
)
```

#### `requires(field, ...deps, options?)`

Makes `field` enabled only when all of its dependencies are satisfied and available. Dependencies can be field names (checked for satisfaction + availability) or predicates (evaluated directly).

```ts
requires('billingAddress', 'plan', (values) => values.plan !== 'free')
```

Multiple dependencies are ANDed. `requires` controls `enabled`, not `required` — to block a submit on a missing conditional field, set `required: true` in the field def.

#### `disables(source, targets[], options?)`

Disables every field in `targets` when `source` is satisfied. `source` can be a field name or an async predicate.

```ts
disables('useSso', ['password', 'confirmPassword'], {
  reason: 'managed by SSO provider',
})
```

#### `oneOf(groupName, branches, options?)`

Mutually exclusive field groups. Exactly one branch can be active at a time; fields in inactive branches are disabled.

The `activeBranch` option pins a branch by name, or you can provide a function (sync or async) that resolves the active branch name.

```ts
oneOf(
  'authMethod',
  {
    password: ['password', 'confirmPassword'],
    sso: ['ssoProvider', 'ssoToken'],
  },
  {
    activeBranch: async (values) => {
      const config = await fetchOrgConfig()
      return config.ssoEnabled ? 'sso' : 'password'
    },
  },
)
```

#### `anyOf(...rules)`

OR combinator. The field is enabled (or fair) if any of the wrapped rules passes. Rules run in parallel via `Promise.all`. All wrapped rules must target the same fields and must be the same constraint type (all availability rules, or all fairness rules).

```ts
anyOf(
  enabledWhen('discount', (values) => values.plan === 'annual'),
  enabledWhen('discount', check('referralCode', isValidCode)),
)
```

#### `eitherOf(groupName, branches)`

OR across named branches, where each branch is itself a set of rules ANDed together. A field passes if any branch's rules all pass. Rules within each branch run in parallel.

```ts
eitherOf('accessPath', {
  directInvite: [enabledWhen('dashboard', (v) => Boolean(v.inviteToken))],
  verifiedEmail: [
    enabledWhen('dashboard', (v) => Boolean(v.email)),
    enabledWhen('dashboard', (v) => v.emailVerified === true),
  ],
})
```

#### `check(field, validator)`

Builds a predicate that passes when the field's current value satisfies `validator`. Returns a predicate function for use inside `requires`, `enabledWhen`, etc. The validator can be async.

```ts
requires(
  'confirmPassword',
  'password',
  check('password', async (pw) => {
    return meetsStrengthPolicy(pw)
  }),
)
```

#### `createRules<F, C>()`

Returns all builders narrowed to your field and condition types. Zero runtime overhead — purely a type-level convenience that avoids repeated type annotations.

```ts
const { enabledWhen, requires, fairWhen } = createRules<
  typeof fields,
  AppConditions
>()
```

#### `defineRule(config)`

Low-level escape hatch for custom async evaluation. Prefer the built-in builders. Use this only when you need to plug custom logic directly into Umpire's evaluation pipeline.

```ts
defineRule({
  type: 'myCustomRule',
  targets: ['field'],
  sources: ['otherField'],
  evaluate: async (values, conditions, prev, fields, availability, signal) => {
    signal.throwIfAborted()
    const passed = await myCheck(values)
    return new Map([
      ['field', { enabled: passed, reason: passed ? null : 'blocked' }],
    ])
  },
})
```

### Options shared by rule builders

All rule builders accept an optional trailing `options` object:

```ts
type RuleOptions = {
  reason?: string | ((values, conditions) => string | Promise<string>)
  trace?: RuleTraceAttachment | RuleTraceAttachment[]
}
```

`reason` can be a static string or a function — sync or async — that produces the reason string at evaluation time.

### Async validators

Pass validators in the `validators` config to attach validation results to the availability map. Validators only run on enabled, satisfied fields.

Accepted shapes:

```ts
// Async function — return boolean or { valid, error? }
type AsyncValidationFunction<T> = (
  value: NonNullable<T>,
) => ValidationOutcome | Promise<ValidationOutcome>

// Object with safeParseAsync (e.g. Zod v4 with async refinements)
type AsyncSafeParseValidator<T> = {
  safeParseAsync(value: NonNullable<T>): Promise<{ success: boolean }>
}
```

All sync validator shapes accepted by `@umpire/core` also work: plain functions, objects with `safeParse`, objects with `test`, and named checks.

To override the error message from any validator, wrap it:

```ts
validators: {
  username: {
    validator: myAsyncUsernameValidator,
    error: 'username is not available',
  },
}
```

After `check()` resolves, enabled and satisfied fields with a validator will include `valid: boolean` and, when invalid, `error?: string` on their availability entry.

### `Umpire` instance methods

#### `check(values, conditions?, prev?, signal?): Promise<AvailabilityMap>`

Evaluates availability for all fields. Returns a map from field name to `{ enabled, satisfied, fair, required, reason?, reasons?, valid?, error? }`.

Accepts partial values — omitted fields are treated as unsatisfied. Pass `prev` when your rules inspect the previous snapshot (e.g. `oneOf` transition logic).

Starting a new `check()` automatically cancels the previous in-flight check. The cancelled check's Promise rejects with an `AbortError`. Pass an `AbortSignal` as the fourth argument to cancel externally.

#### `play(before, after, signal?): Promise<Foul[]>`

Compares two snapshots and returns suggested resets for fields that became disabled or foul and still hold stale values. Each `Foul` entry has `{ field, reason, suggestedValue }`.

```ts
const fouls = await ump.play(
  { values: prevValues, conditions },
  { values: nextValues, conditions },
)
```

#### `scorecard(snapshot, options?): Promise<ScorecardResult>`

Debugging surface. Returns a full picture of every field including transition analysis, rule traces, and graph edges. Not intended as an app-state input — use `check()` for that.

Pass `options.signal` to cancel externally. Pass `options.before` to include transition analysis. Pass `options.includeChallenge: true` to attach per-field rule traces.

#### `challenge(field, values, conditions?, prev?): Promise<ChallengeTrace>`

Explains exactly which rules affected a single field and why. Safe to call with partial values. Does not support external cancellation — it uses an internal non-cancellable signal.

```ts
const trace = await ump.challenge('username', values, conditions)
// trace.directReasons — per-rule breakdown with passed/failed and reason
```

#### `init(overrides?): FieldValues`

Returns a values object populated from field defaults. Overrides replace specific fields. Synchronous.

#### `graph(): UmpireGraph`

Returns the dependency graph as `{ nodes, edges }`. Synchronous. Returns a defensive copy — mutating it does not affect evaluation.

#### `rules(): AsyncRuleEntry[]`

Returns rule metadata including index, id, and inspection data. Synchronous.

### Cancellation

`@umpire/async` has first-class cancellation at every layer.

**Auto-cancel.** Starting a new `check()` cancels any in-flight check on the same `Umpire` instance. The cancelled Promise rejects with an `AbortError`. This keeps your UI consistent when values change faster than rules evaluate — only the latest check matters.

```ts
const first = ump.check(staleValues) // cancelled automatically
const result = await ump.check(freshValues) // this one wins
await first.catch(() => {}) // suppress the AbortError from the first check
```

**External signal.** Pass an `AbortSignal` to cancel from outside — useful for route navigation, component unmount, or request deduplication.

```ts
const controller = new AbortController()

// cancel on unmount, navigation, etc.
onDestroy(() => controller.abort())

const availability = await ump.check(
  values,
  conditions,
  undefined,
  controller.signal,
)
```

`play()` and `scorecard()` also support external signals. `challenge()` does not.

**`onAbort` hook.** The `onAbort` option fires whenever a check is cancelled, whether by auto-cancel or an external signal. Use it to clear loading state or update UI.

```ts
const ump = umpire({
  fields: { ... },
  rules: [ ... ],
  onAbort: (reason) => {
    setLoading(false)
  },
})
```

If `onAbort` throws, the error is swallowed — it will not produce an unhandled rejection.

## Docs

- [Quick Start](https://umpire.tools/learn/)
- [Core concepts](https://umpire.tools/concepts/)
