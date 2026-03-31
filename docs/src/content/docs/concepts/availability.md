---
title: Availability vs Validation
description: Umpire decides whether a field is available, not whether a value is correct.
---

Umpire answers one question per field: **should this be on the field right now?**

Not "is this value correct?" Not "does this pass validation?" Just: given everything else in the form, is this field in play?

## The Baseball Lineup

Picture a baseball manager filling out a lineup card. A player might be out of the lineup for structural reasons that have nothing to do with talent:

- **Starting pitcher threw yesterday** — he *requires* rest days before he's eligible again. Like `requires('startingPitcher', 'restDays')`.
- **Outfielder pulled a hamstring** — the injury report *disables* him. Like `disables('injuryReport', ['outfielder'])`.
- **Lefty pitcher on the mound** — you platoon: start the righty batter, bench the lefty. Like `oneOf('platoonMatchup', { lefty: ['batter_L'], righty: ['batter_R'] })`.

None of these are about whether a player is *good*. They're about whether a player is *eligible* given the current situation. The manager doesn't evaluate swing mechanics — that's a different job.

Umpire works the same way. It doesn't care if your email is well-formed or your password meets policy. It cares whether `confirmPassword` should even appear before `password` has a value, and whether `companySize` should disappear when the user switches from a business plan to personal.

## Availability Is Structural

Good Umpire rules describe field relationships:

- `requires('repeatEvery', 'startTime')` — can't set a repeat interval without a start time
- `enabledWhen('companyName', (_v, cond) => cond.plan === 'business')` — company fields only appear for business accounts
- `oneOf('subDayStrategy', { hourList: ['everyHour'], interval: ['startTime', 'endTime'] })` — pick one scheduling approach

Not Umpire's job:

- Syncing `endTime` after `startTime` changes (value coercion)
- Auto-filling a fallback calendar ID (defaulting logic)
- Checking that an email address has an `@` (validation)
- Submitting the form

If the logic decides whether a field is *available*, Umpire is the right layer. If it transforms values or proves they're correct, keep it elsewhere.

## Recommendations, Not Mutations

When the manager scratches a player from the lineup, the player still exists. He's in the dugout. His stats are still on the board.

Umpire works the same way. When a field becomes disabled, Umpire doesn't clear it. The value is still there — and it should be, because `disables` and `oneOf` intentionally check stale values. A disabled field with a lingering value still affects its dependents until the consumer clears it.

`flag()` returns reset *recommendations*. The consumer decides when and how to apply them — immediately, after a confirmation prompt, or not at all.

## Pure Core, Reactive Adapters

`@umpire/core` is a pure function engine. Hand it values and conditions, get availability back. No framework, no DOM, no subscriptions.

The adapter packages layer reactivity on top:

- `@umpire/react` — a `useUmpire` hook that memoizes `check()` and tracks `prev` via `useRef`
- `@umpire/signals` — signal-backed availability with fine-grained proxy tracking
- `@umpire/zustand` — subscribes to a store slice, penalties come free from Zustand's `(next, prev)`

## Five Principles

1. **Availability, not validation.** Should this field be in play right now? Not: is this value correct?
2. **Recommendations, not mutations.** `flag()` suggests resets. State ownership stays with the consumer.
3. **Pure core, reactive adapters.** Core is framework-free. Adapters are thin.
4. **Explainable.** Every disabled field has a `reason`. `challenge()` exposes the full dependency trace.
5. **Tiny.** Field interdependencies, not form orchestration. If the scope grows past that, something is wrong.
