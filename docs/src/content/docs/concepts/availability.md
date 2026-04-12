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

Also Umpire's job:

- `fairWhen('motherboard', (mb, v) => socketFor(mb) === socketFor(v.cpu ?? ''))` — is this value still an appropriate selection?

Not Umpire's job:

- Syncing `endTime` after `startTime` changes (value coercion)
- Auto-filling a fallback calendar ID (defaulting logic)
- Checking that an email address has an `@` (validation)
- Submitting the form

If the logic decides whether a field is *available*, Umpire is the right layer. If it transforms values or proves they're correct, keep it elsewhere.

That said, availability and validation are closely related — a field needs to be *present* before it can be *valid*, and sometimes a field needs to be *valid* before a dependent field becomes available. See [satisfaction semantics](/concepts/satisfaction/#use-presence-first-validation-second) for how presence checks work, and [composing with validation](/concepts/validation/) for how to plug in libraries like Zod alongside Umpire.

## Recommendations, Not Mutations

When the manager scratches a player from the lineup, the player still exists. He's in the dugout. His stats are still on the board.

Umpire works the same way. When a field becomes disabled, Umpire doesn't clear it. The value is still there — and it should be, because `disables` and `oneOf` intentionally check stale values. A disabled field with a lingering value still affects its dependents until the consumer clears it.

`play()` returns reset *recommendations*. The consumer decides when and how to apply them — immediately, after a confirmation prompt, or not at all.

## Availability as Visibility

Umpire tells you whether a field is available. What you do with that information is up to you.

A common pattern: if a field isn't available, don't show it. Hide it with CSS, conditionally render it, remove it from the DOM entirely — whatever fits your UI. The availability map *is* a visibility map if you want it to be.

```tsx
// React — conditionally render
const { companyName } = ump.check(values, { plan });

{companyName.enabled && (
  <input name="companyName" value={values.companyName} />
)}
```

```ts
// Vanilla JS — toggle with CSS
const result = ump.check(values);
for (const [field, status] of Object.entries(result)) {
  document.getElementById(field).hidden = !status.enabled;
}
```

```tsx
// Or just disable it — your call
<input
  name="companyName"
  disabled={!companyName.enabled}
  value={values.companyName}
/>
```

Umpire doesn't have an opinion here. It doesn't distinguish between "hidden" and "disabled" — it gives you `enabled: boolean` and you decide the presentation. Some forms dim unavailable fields so users can see what's possible. Others remove them entirely to reduce clutter. Both are valid.

## Pre-Building Option Sets

For UIs with lots of selects and no text input — printer dialogs, configuration panels, quote builders — you can use `check()` at initialization time to figure out which options are available under each top-level selection, then build your option sets up front.

The idea: loop through each possible value of the driving field, call `check()` with that value, and record which dependent fields are enabled. Now your render logic doesn't need to think about availability at all — it just picks the pre-built set for the current selection.

```ts
import { umpire, enabledWhen, disables } from '@umpire/core'

const printerUmp = umpire({
  fields: {
    printer: {},
    colorMode: {},
    duplex: {},
    paperType: {},
    bannerMode: {},
    staple: {},
  },
  rules: [
    enabledWhen('colorMode', v => v.printer === 'colorLaser',
      { reason: 'Fixed color mode on this printer' }),
    enabledWhen('duplex', v => v.printer === 'colorLaser',
      { reason: 'Only the color laser supports duplex' }),
    enabledWhen('paperType', v => v.printer === 'inkjetPhoto',
      { reason: 'Paper type only applies to the photo printer' }),
    enabledWhen('bannerMode', v => v.printer === 'dotMatrix',
      { reason: 'Banner mode is only available on the dot-matrix' }),
    enabledWhen('staple', v => v.printer === 'colorLaser',
      { reason: 'Only the color laser has a stapler' }),
  ],
})

// At init: check each printer to learn its available fields
const printers = ['dotMatrix', 'colorLaser', 'inkjetPhoto'] as const

const optionsByPrinter = Object.fromEntries(
  printers.map(printer => {
    const result = printerUmp.check({ printer })
    const enabled = Object.entries(result)
      .filter(([_, status]) => status.enabled)
      .map(([field]) => field)
    return [printer, enabled]
  }),
)

// optionsByPrinter is now:
// {
//   dotMatrix:    ['printer', 'bannerMode'],
//   colorLaser:   ['printer', 'colorMode', 'duplex', 'staple'],
//   inkjetPhoto:  ['printer', 'paperType'],
// }
```

At render time, you just look up `optionsByPrinter[currentPrinter]` and show those fields. No availability logic in the render path — it's already resolved.

This works because `check()` is pure and cheap. There's no cost to calling it many times during setup, and the results are deterministic — same inputs, same output.

You still want live `check()` calls for interactions *within* a printer's options (like banner mode disabling paper size), but the top-level "which fields exist for this printer" question is answered once at init.

## Pure Core, Reactive Adapters

`@umpire/core` is a pure function engine. Hand it values and conditions, get availability back. No framework, no DOM, no subscriptions.

The adapter packages layer reactivity on top:

- `@umpire/react` — a `useUmpire` hook that memoizes `check()` and tracks `prev` via `useRef`
- `@umpire/solid` — Solid adapter for component-local state or shared store-backed state
- `@umpire/signals` — signal-backed availability with fine-grained proxy tracking
- `@umpire/store` — strict store adapter foundation for `getState()` + `subscribe((next, prev) => ...)`
- `@umpire/zustand` — zero-shim entry point over `@umpire/store`
- `@umpire/redux`, `@umpire/pinia`, `@umpire/tanstack-store`, and `@umpire/vuex` — thin shims that normalize their subscription APIs into the same contract

## Five Principles

1. **Availability and appropriateness, not validation.** Should this field be in play? Is its current value still a sensible selection? Not: is this value correct?
2. **Recommendations, not mutations.** `play()` suggests resets. State ownership stays with the consumer.
3. **Pure core, reactive adapters.** Core is framework-free. Adapters are thin.
4. **Explainable.** Every disabled field has a `reason`. `challenge()` exposes the full dependency trace.
5. **Tiny.** Field interdependencies, not form orchestration. If the scope grows past that, something is wrong.
