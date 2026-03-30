---
title: Availability vs Validation
description: Umpire decides whether a field is available, not whether a value is correct.
---

# Availability vs Validation

Umpire is about field availability: whether a field should be enabled, whether it still counts as required, and why it is off the field.

Validation answers a different question: whether the current value is correct. Those concerns overlap in the UI, but the library keeps them separate on purpose.

## The Core Distinction

Availability is structural.

- Should `confirmPassword` be available before `password` exists?
- Should `companySize` stay enabled when the user leaves the business plan?
- Should `submit` stay gated until an external captcha token exists?

Validation is correctness.

- Is the email address well-formed?
- Does the password meet policy?
- Do `startTime` and `endTime` form a valid interval?

Umpire handles the first set. Your validation library handles the second.

## Recommendations, Not Mutations

When a field becomes disabled, Umpire does not clear it. It returns a reset recommendation through `flag()`.

That distinction matters because stale state is still real state. A disabled field with a lingering value can still affect `disables()` and `oneOf()` resolution until the consumer clears it.

## Pure Core, Reactive Adapters

`@umpire/core` is a pure function engine. It knows about field definitions, rules, values, context, and previous values for `oneOf()` resolution. It does not know about React, signals, Zustand, or the DOM.

The adapter packages layer reactivity on top:

- `@umpire/react` exposes a hook.
- `@umpire/signals` exposes signal-backed availability and penalties.
- `@umpire/zustand` subscribes to a store slice.

## The Five Design Principles

1. Availability, not validation. Ask whether a field should be on the field, not whether its value is correct.
2. Recommendations, not mutations. `flag()` suggests resets and leaves state ownership to the consumer.
3. Pure core, reactive adapters. Core stays framework-free, adapters stay thin.
4. Explainable. Every disabled field has a `reason`, and `challenge()` can expose the full trace.
5. Tiny. The library is intentionally scoped to field interdependencies, not full form orchestration.

## Practical Boundary

Good Umpire rules:

- `requires('repeatEvery', 'startTime')`
- `enabledWhen('companyName', (_values, ctx) => ctx.plan === 'business')`
- `oneOf('subDayStrategy', { hourList: ['everyHour'], interval: ['startTime', 'endTime'] })`

Not Umpire’s job:

- Syncing `endTime` after `startTime` changes
- Auto-filling fallback calendar IDs
- Submitting forms
- Running schema validation over every field

If the logic decides whether a field is available, Umpire is the right layer. If it transforms values or proves they are correct, keep it elsewhere.
