# Effect v4 Full Integration Plan

## Problem

`@umpire/effect` currently uses Effect as a schema library and as a reactive primitive (`SubscriptionRef`), but drops out of the Effect type system at the boundary. Every operation resolves with `Effect.runSync` internally and returns plain objects. This means:

- Umpire validation cannot be composed into `Effect.gen` generator flows via `yield*`
- Validation failures live in plain data, not in the Effect error channel — no `catchAll`, `mapError`, or typed error handling
- There is no `Context.Tag` / `Layer` for umpire instances, so umpire cannot be injected as an Effect service
- `fromSubscriptionRef` exposes an imperative `destroy()` pattern instead of a composable `Stream`
- Key operations produce no spans, so they are invisible to Effect's telemetry

The goal is to add a fully Effect-typed surface on top of the existing synchronous one, without breaking existing callers.

---

## New API Surface

### 1. `UmpireValidationError` — Effect-native tagged error

```ts
import { Data } from 'effect'
import type { NormalizedFieldError } from './derive-errors.js'

class UmpireValidationError extends Data.TaggedError('UmpireValidationError')<{
  readonly errors: Record<string, string | undefined>
  readonly normalizedErrors: NormalizedFieldError[]
}> {}
```

Used as the `E` channel in effectful adapter methods. Callers can match on `_tag === 'UmpireValidationError'` or use `Effect.catchTag`.

### 2. `EffectAdapter` — two new methods

```ts
type EffectAdapter<F extends Record<string, FieldDef>> = {
  // existing — unchanged
  validators: ValidationMap<F>
  run(availability: AvailabilityMap<F>, values: InputValues): EffectAdapterRunResult<F>

  // new: wraps run() in Effect.sync — composable, never fails
  runEffect(
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): Effect.Effect<EffectAdapterRunResult<F>, never, never>

  // new: fails with UmpireValidationError when validation has errors
  runValidate(
    availability: AvailabilityMap<F>,
    values: InputValues,
  ): Effect.Effect<Record<string, unknown>, UmpireValidationError, never>
}
```

`runEffect` is the low-friction entry point: it mirrors `run()` but is `yield*`-composable and carries the full result (errors as data). `runValidate` is for callers who want Effect's error channel for flow control.

Usage in a generator flow:

```ts
const result = yield* adapter.runEffect(availability, values)
// result.errors, result.schemaFields, result.result — same shape as today

// or, to branch on validation failure:
const decoded = yield* adapter.runValidate(availability, values)
// decoded is the validated & decoded value object; failures go to error channel
```

### 3. `availabilityStream` — composable Stream

```ts
function availabilityStream<S, F extends Record<string, FieldDef>, C>(
  ump: Umpire<F, C>,
  ref: SubscriptionRef.SubscriptionRef<S>,
  options: FromStoreOptions<S, C>,
): Stream.Stream<AvailabilityMap<F>, never, never>
```

Returns a `Stream` of availability maps that the caller composes with the rest of their Effect program. No `destroy()` callback — Stream lifetime is controlled by the caller's runtime.

```ts
// downstream composition examples
pipe(
  availabilityStream(ump, ref, opts),
  Stream.map(av => deriveSchema(av, schemas)),
  Stream.tap(schema => Effect.log('schema updated')),
  Stream.runForEach(av => updateUI(av)),
)
```

`fromSubscriptionRef` stays as-is for callers that need the `UmpireStore` contract (zustand-style subscribe/getState). `availabilityStream` is the new primitive for pure Effect programs.

### 4. `umpireLayer` — Layer factory

```ts
function umpireLayer<F extends Record<string, FieldDef>, C, I>(
  Tag: Context.Tag<I, Umpire<F, C>>,
  definition: Parameters<typeof umpire>[0],
): Layer.Layer<I, never, never>
```

Wraps `umpire(definition)` in `Layer.sync`. Callers define their own tag (the standard Effect pattern for typed services) and pass it here:

```ts
class MyUmpire extends Context.Tag('MyUmpire')<MyUmpire, Umpire<typeof fields>>() {}

const MyUmpireLayer = umpireLayer(MyUmpire, { fields, rules })

// then in a program:
const program = Effect.gen(function* () {
  const ump = yield* MyUmpire
  // ...
})

Effect.runPromise(Effect.provide(program, MyUmpireLayer))
```

### 5. `Effect.fn` tracing for key operations

Wrap `runEffect`, `runValidate`, and `availabilityStream`'s per-emission work with `Effect.fn` so they show up in Effect's built-in telemetry and stack traces:

```ts
const runEffectFn = Effect.fn('@umpire/effect:runEffect')(
  (availability, values) => Effect.sync(() => run(availability, values))
)
```

---

## Implementation Plan

### Phase 1 — Typed error + `runEffect` / `runValidate` (highest value, lowest risk)

**New file: `src/errors.ts`**
- Export `UmpireValidationError extends Data.TaggedError`
- Add to public exports in `src/index.ts`

**Modify: `src/adapter.ts`**
- Add `runEffect()` and `runValidate()` to the `EffectAdapter` type and `createEffectAdapter` return
- `runEffect`: `Effect.sync(() => this.run(availability, values))`
- `runValidate`: calls `runEffect`, then checks `result.errors` — if any keys present, `Effect.fail(new UmpireValidationError(...))`, else `Effect.succeed(decoded value from result.result)`
- Wrap both with `Effect.fn` for tracing

No existing types change. This is purely additive.

**Changeset:** patch bump (new exports, no breaking changes).

---

### Phase 2 — `availabilityStream` (additive, replaces imperative pattern)

**New file: `src/availability-stream.ts`**
- Import `Stream`, `SubscriptionRef`, `Effect` from `effect`
- Import `fromStore` / `trackPreviousState` from `@umpire/store` for availability computation, or drive availability directly via `ump.check()`
- Implementation sketch:

```ts
export function availabilityStream<S, F extends Record<string, FieldDef>, C>(
  ump: Umpire<F, C>,
  ref: SubscriptionRef.SubscriptionRef<S>,
  options: FromStoreOptions<S, C>,
): Stream.Stream<AvailabilityMap<F>> {
  return pipe(
    SubscriptionRef.changes(ref),  // emits current + all updates
    Stream.map(state => ump.check(options.getValues(state), options.context?.(state))),
  )
}
```

- Add `availabilityStream` to `src/index.ts` exports

**Note:** `fromSubscriptionRef` is NOT removed. It satisfies the `UmpireStore` contract (needed for `@umpire/store`-based adapters). `availabilityStream` is an alternative for pure Effect programs.

**Changeset:** patch bump.

---

### Phase 3 — `umpireLayer` (additive)

**New file: `src/layer.ts`**

```ts
import { Layer } from 'effect'
import type { Context } from 'effect'
import { umpire } from '@umpire/core'
import type { FieldDef, Umpire } from '@umpire/core'

export function umpireLayer<F extends Record<string, FieldDef>, C, I>(
  Tag: Context.Tag<I, Umpire<F, C>>,
  definition: Parameters<typeof umpire<F, C>>[0],
): Layer.Layer<I, never, never> {
  return Layer.sync(Tag, () => umpire(definition))
}
```

- Add `umpireLayer` to `src/index.ts` exports

**Changeset:** patch bump.

---

### Phase 4 — `Effect.fn` tracing (low effort, high telemetry value)

This overlaps with Phase 1 implementation. Ensure all new Effect-returning functions are wrapped with `Effect.fn('namespace:functionName')`. Specifically:
- `@umpire/effect:runEffect`
- `@umpire/effect:runValidate`

Operations inside `availabilityStream` are already named by virtue of being Stream combinators; no additional `Effect.fn` needed there.

---

## What Is Out of Scope

**Schema `R` channel (context-requiring schemas).** `AnyEffectSchema` is currently typed as `Schema.Decoder<unknown, never>` — the `never` means no context requirements. Supporting schemas that depend on Effect services (e.g., a schema that fetches from a database for uniqueness checks) would require threading `R` through `FieldSchemas`, `deriveSchema`, `adapter.run`, and both adapter methods. This is a significant API surface change that should be its own minor revision once the core Effect integration is stable.

**`runValidate` decoded type precision.** `runValidate` returns `Effect<Record<string, unknown>, ...>` rather than a structurally typed decoded output. Narrowing this to the actual decoded shape would require inferring the output type from the `FieldSchemas` map, which is complex and likely requires a separate utility type. Start with `Record<string, unknown>` and narrow later.

**Removing `fromSubscriptionRef`.** It satisfies a different contract (`UmpireStore`) than `availabilityStream` and will remain for adapter-level consumers.

---

## File Checklist

| File | Change |
|------|--------|
| `src/errors.ts` | **New** — `UmpireValidationError` |
| `src/adapter.ts` | **Modify** — add `runEffect`, `runValidate` to type + implementation |
| `src/availability-stream.ts` | **New** — `availabilityStream` |
| `src/layer.ts` | **New** — `umpireLayer` |
| `src/index.ts` | **Modify** — re-export all new public symbols |
| `__tests__/adapter.test.ts` | **Modify** — add tests for `runEffect` and `runValidate` |
| `__tests__/availability-stream.test.ts` | **New** — stream composition tests |
| `__tests__/layer.test.ts` | **New** — layer construction and yield tests |
