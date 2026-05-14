---
title: JSX
description: Define Umpire fields and rules with JSX — a familiar HTML-like syntax for learning and prototyping.
---

JSX... but it builds a rules engine instead of a webpage. Yes, really. 🧑‍⚖️

You know JSX, right? It's that `<Button onClick={...}>Click me</Button>` stuff from React. Or maybe you don't know JSX but you do know HTML.

Normally when you write JSX or HTML, it turns into a real thing on the screen — a button, a form, a spinning loading indicator.

`@umpire/jsx` does something completely different and a little weird: it takes JSX tags like `<Field>` and `<Requires>` and builds an **umpire evaluator** — an object you call `.check()` on to find out which fields are available in your app right now. No DOM. No browser. No components. Just a rules engine wearing JSX's clothes.

It's built for learning, teaching, and quick prototyping. (Background: I (Doug) wanted to teach my son (11) about the library I was building out. He understands HTML isn't as comfortable with "real" code. This felt like a natural bridge. I hope it helps you too.)

This is not the "production" way to use umpire — it costs you a JSX transform and an extra dependency. But it buys you a config format that looks like the web you already know.

## The idea

In regular umpire, you write rules imperatively:

```ts
const ump = umpire({
  fields: {
    name: { required: true },
    age: {},
  },
  rules: [
    requires('age', 'name'),
    fairWhen('age', (v) => Number(v) >= 0, { reason: 'Age cannot be negative' }),
  ],
})
```

With JSX, you nest the rules inside the field they describe:

```tsx
const ump = (
  <Umpire>
    <Field name="name" required />
    <Field name="age">
      <Requires dep="name" />
      <FairWhen check={(v) => Number(v) >= 0} reason="Age cannot be negative" />
    </Field>
  </Umpire>
)
```

When you call the JSX tree, it returns a full umpire instance. You use it exactly like the imperative version — all the methods work the same (`check()`, `challenge()`, `play()`), and all the results are identical.

## Install and setup

Install the package:

```bash
npm install @umpire/jsx @umpire/dsl
```

Then tell TypeScript to transform JSX using the `@umpire/jsx` runtime. You have two options.

### Option 1: tsconfig.json (global)

In your `tsconfig.json`, set the JSX import source once for all `.tsx` files:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@umpire/jsx"
  }
}
```

Then any `.tsx` file will transform correctly without per-file comments.

### Option 2: File pragma (one-off)

If you only use JSX in specific files, add a comment at the top:

```tsx
/** @jsxImportSource @umpire/jsx */

import { Umpire, Field, Requires } from '@umpire/jsx'

const ump = (
  <Umpire>
    <Field name="dino" />
  </Umpire>
)
```

Use whichever fits your project. For a learning environment or a small config file, the pragma is fine. For a whole feature, use tsconfig.

## Your first umpire

Let's build something simple: a dinosaur roster where you pick a dino type, and once you do, a habitat field appears.

```tsx
import { Umpire, Field, Requires } from '@umpire/jsx'

const dinoRoster = (
  <Umpire>
    <Field name="dinoType" required />
    <Field name="habitat">
      <Requires dep="dinoType" />
    </Field>
  </Umpire>
)

// Check the state with no values filled
const empty = dinoRoster.check({ dinoType: null, habitat: null })
console.log(empty.habitat.enabled) // false — waiting for dinoType

// Now pick a dino type
const withDino = dinoRoster.check({ dinoType: 'triceratops', habitat: null })
console.log(withDino.habitat.enabled) // true — now you can fill habitat
```

That's it. You've described a conditional field in JSX. Calling `<Umpire>` returns a full umpire instance with `check()`, `challenge()`, `scorecard()`, and every other method from `@umpire/core`.

## Components

### Umpire

The root component. It wraps your entire config and returns an umpire instance. Children must be `<Field>`, `<StandaloneDisables>`, or `<OneOf>` components.

```tsx
const ump = (
  <Umpire>
    <Field name="x" />
    <Field name="y" />
  </Umpire>
)
```

It does all the validation when the tree is evaluated — unknown field references, malformed rules, and conflicting props all throw at call time, never later.

### Field

Define a single field. Set its name and whether it's required; nest rule components inside.

Props:
- `name` (required): the field's key in your values object
- `required`: optional boolean — if true, the field must have a value or a write check will flag it
- `isEmpty`: optional function — override how "empty" is detected. By default only `null` and `undefined` are empty

```tsx
<Field name="email" required />
```

A field with a custom emptiness check:

```tsx
<Field name="score" isEmpty={(v) => v === 0}>
  <FairWhen check={(v) => Number(v) >= 0} />
</Field>
```

When you call `check()` on this umpire, a score of 0 will be unsatisfied, but any other number (including negative) will be satisfied. Fairness is checked separately.

### Requires

Make a field available only when a dependency is met. Nest it inside the field it affects.

Props:
- `dep`: required unless `when` is used. The field this one depends on
- `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `truthy`, `falsy`: optional value matchers. If any are set, `dep` is required
- `when`: optional `Expr` from `@umpire/dsl`. Use this for multi-field conditions. Cannot be combined with `dep`
- `reason`: optional string explaining why the field is disabled

Simplest form — field is disabled until `dep` is satisfied:

```tsx
<Field name="email" />
<Field name="password">
  <Requires dep="email" />
</Field>
```

With a value matcher — password field is disabled until email matches a pattern:

```tsx
<Field name="plan" />
<Field name="proFeatures">
  <Requires dep="plan" eq="premium" reason="Premium members only" />
</Field>
```

Multiple matchers AND together. This field is disabled unless age is between 60 and 120:

```tsx
<Field name="age" />
<Field name="seniorDiscount">
  <Requires dep="age" gte={60} lte={120} />
</Field>
```

For complex multi-field conditions, use `when` with an `Expr` from `@umpire/dsl`:

```tsx
import { expr } from '@umpire/dsl'

<Field name="memberType" />
<Field name="age" />
<Field name="vipArea">
  <Requires
    when={expr.and(
      expr.eq('memberType', 'premium'),
      expr.gte('age', 21),
    )}
    reason="Premium members, 21+, only"
  />
</Field>
```

When you use `when`, you cannot also use `dep` or value props.

### Disables

Make a field disable other fields when it's satisfied. Nest it inside the field that does the disabling.

Props:
- `fields`: array of field names to disable
- `reason`: optional string explaining why they're disabled

Example: when you pick guest checkout, the account fields disappear.

```tsx
<Field name="guestCheckout">
  <Disables
    fields={['accountEmail', 'accountPassword']}
    reason="Not needed for guest checkout"
  />
</Field>
<Field name="accountEmail" />
<Field name="accountPassword" />
```

### StandaloneDisables

The same as `<Disables>`, but lives at the root of `<Umpire>` instead of inside a `<Field>`. Use this when the source and target fields are far apart in the tree and nesting feels awkward.

Props:
- `source`: the field that does the disabling
- `fields`: array of field names to disable
- `reason`: optional explanation

```tsx
<Umpire>
  <Field name="adminMode" />
  <Field name="userEmail" />
  <Field name="userPassword" />
  <StandaloneDisables
    source="adminMode"
    fields={['userEmail', 'userPassword']}
    reason="Admin mode controls everything"
  />
</Umpire>
```

### FairWhen

Mark a field foul when its value fails a check. Nest it inside the field. Only fires when the field is satisfied — if the field is empty, the check is skipped.

Props:
- `check`: function that receives the field's value. Return `false` to mark it foul
- `reason`: optional string explaining why the value is foul

```tsx
<Field name="age" required>
  <FairWhen
    check={(v) => Number(v) >= 0}
    reason="Age cannot be negative"
  />
</Field>
```

If the field is empty (null or undefined), fairness is not checked. If you set a value, the check runs.

### OneOf

Enforce mutual exclusivity across branches — only one branch can be in play at a time. Lives at the root of `<Umpire>`.

Props:
- `name`: group name for debugging
- `groups`: object mapping branch names to field arrays. Each branch is a list of fields that belong to that option

Example: payment methods. You pick card, bank transfer, or PayPal, but only one:

```tsx
<Umpire>
  <Field name="creditCard" />
  <Field name="bankTransfer" />
  <Field name="paypal" />
  <OneOf
    name="payment"
    groups={{
      card: ['creditCard'],
      bank: ['bankTransfer'],
      digital: ['paypal'],
    }}
  />
</Umpire>
```

When `creditCard` is satisfied, the other branches are disabled. When you clear it, they light back up.

## A richer example

Let's build a football game config where:
- You pick a team
- Once you pick a team, you enter the score and pick offensive plays
- The defensive plays field only appears if the offense is strong (score > 20)
- You cannot use both "blitz" and "coverage" at the same time

```tsx
import { Umpire, Field, Requires, Disables, FairWhen, OneOf } from '@umpire/jsx'

const gameConfig = (
  <Umpire>
    <Field name="team" required />

    <Field name="score">
      <Requires dep="team" reason="Pick a team first" />
      <FairWhen check={(v) => Number(v) >= 0} reason="Score cannot be negative" />
    </Field>

    <Field name="offensivePlays">
      <Requires dep="team" reason="Pick a team first" />
    </Field>

    <Field name="defensivePlays">
      <Requires dep="offensivePlays" />
      <Requires dep="score" gte={20} reason="Defensive plays unlock at score > 20" />
    </Field>

    <OneOf
      name="defense"
      groups={{
        blitz: ['blitzRate'],
        coverage: ['coverageType'],
      }}
    />

    <Field name="blitzRate" />
    <Field name="coverageType" />
  </Umpire>
)

const snap1 = gameConfig.check({
  team: null,
  score: null,
  offensivePlays: null,
  defensivePlays: null,
  blitzRate: null,
  coverageType: null,
})
console.log(snap1.score.enabled) // false
console.log(snap1.defensivePlays.enabled) // false

const snap2 = gameConfig.check({
  team: 'seahawks',
  score: 25,
  offensivePlays: 'pass-heavy',
  defensivePlays: 'aggressive',
  blitzRate: 0.6,
  coverageType: null,
})
console.log(snap2.score.enabled) // true
console.log(snap2.defensivePlays.enabled) // true
console.log(snap2.coverageType.enabled) // false — blitzRate is set, so coverage is disabled
```

## When to use JSX, when to use the imperative API

### Use JSX if:
- You're learning umpire and the nested syntax makes the rules clearer to you
- You're teaching someone else — the HTML-like shape is a familiar entry point
- You're prototyping fast and don't mind the extra build step
- You're building a small, self-contained config

### Switch to the imperative API if:
- You're shipping to production and want to minimize bundle size
- You're generating configurations dynamically (with JSX you need static trees)
- Your team prefers imperative, function-based code
- You need conditions — JSX supports them through `when`, but conditions are more natural in the `umpire()` constructor

Both produce identical umpire instances. There is no performance difference at runtime.

## Error messages

All validation errors start with `[@umpire/jsx]` and throw when you call `<Umpire>`. Common ones:

- `"when" cannot be combined with "dep" or value props on <Requires>` — use one or the other
- `Value props require "dep" on <Requires>` — if you use `eq`, `gte`, etc., you must name the dependency
- `Unknown field "x" in <StandaloneDisables>` — you referenced a field that doesn't exist
- `oneOf branch "name" must not be empty` — every branch needs at least one field

## See also

- [Availability](/concepts/availability/) — the ideas behind enabled, satisfied, and fair
- [The requires rule](/api/rules/requires/) — how dependencies work under the hood
- [React adapter](/adapters/react/) — using umpire with React components
- [`@umpire/dsl`](/extensions/dsl/) — the expression builder for complex `when` conditions
