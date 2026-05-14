# @umpire/jsx

JSX... but it builds a rules engine instead of a webpage. Yes, really. 🧑‍⚖️

## Install

```
yarn add @umpire/jsx @umpire/core
```

## The Bit

You know JSX, right? It's that `<Button onClick={...}>Click me</Button>` stuff from React. Normally when you write JSX, it turns into a real thing on the screen — a button, a form, a spinning loading indicator.

`@umpire/jsx` does something completely different and a little weird: it takes JSX tags like `<Field>` and `<Requires>` and builds an **Umpire evaluator** — an object you call `.check()` on to find out which fields are available in your app right now.

No DOM. No browser. No components. Just a rules engine wearing JSX's clothes.

```tsx
// This looks like a React component tree...
const ump = (
  <Umpire>
    <Field name="promoCode" />
    <Field name="discount">
      <Requires dep="promoCode" />
    </Field>
  </Umpire>
)

// ...but ump is NOT a component. It's a live evaluator!
ump.check({ promoCode: null, discount: null })
// → { promoCode: { enabled: true, satisfied: false, ... },
//     discount:   { enabled: false, ... } }
```

Why would anyone do this? Because if you already have JSX set up in your project, you get auto-complete, type-checking, and a familiar tree structure for free — without learning a new config format.

If JSX isn't your thing, check out [`@umpire/core`](../core/README.md) for plain function calls or [`@umpire/dsl`](../dsl/README.md) for the expression helpers.

## Quick Example

Let's say you're building a checkout form with a promo code feature. The logic is:

1. First you ask: "Do you have a promo code?" (`hasPromo`)
2. If they say yes, a promo code field appears (`promoCode`)
3. Once they enter a code, a discount field unlocks (`discount`)
4. But if they pick a standard fixed price, the discount is irrelevant and gets turned off

Here's all of that in one JSX tree:

```tsx
/** @jsxRuntime automatic */
/** @jsxImportSource @umpire/jsx */

import { Umpire, Field, Requires, Disables } from '@umpire/jsx'

const ump = (
  <Umpire>
    <Field name="hasPromo" />
    <Field name="promoCode">
      <Requires dep="hasPromo" />
    </Field>
    <Field name="discount">
      <Requires dep="promoCode" />
    </Field>
    <Field name="standardPrice">
      <Disables fields={['discount']} />
    </Field>
  </Umpire>
)
```

Now you can ask questions about any combination of values:

```ts
// Nothing filled in yet — promoCode and discount are locked
ump.check({
  hasPromo: null,
  promoCode: null,
  discount: null,
  standardPrice: null,
})
// → promoCode.enabled = false, discount.enabled = false

// User checked "I have a promo" and entered a code — discount unlocks!
ump.check({
  hasPromo: true,
  promoCode: 'SAVE10',
  discount: null,
  standardPrice: null,
})
// → promoCode.enabled = true, discount.enabled = true

// User picked a standard price instead — discount is disabled again
ump.check({
  hasPromo: true,
  promoCode: 'SAVE10',
  discount: null,
  standardPrice: 99,
})
// → discount.enabled = false
```

Each field result tells you:

- `enabled` — is this field "in play" right now? If `false`, hide it or gray it out.
- `satisfied` — does it have a non-empty value?
- `required` — would an empty value be a problem?
- `fair` — does the value pass a validity check (like "must be positive")?
- `reason` / `reasons` — why is this field disabled or foul?

## Components

### `<Umpire>`

The root of your tree. Put all your `<Field>` and top-level rule components inside it. Returns an umpire evaluator — not a React component, not a DOM node, just a plain object with `.check()`, `.challenge()`, and friends.

```tsx
const ump = <Umpire>{/* fields and top-level rules go here */}</Umpire>
```

---

### `<Field>`

Declares a field. The `name` should match the key you'll use in your values object.

```tsx
<Field name="email" />
<Field name="email" required />
<Field name="score" isEmpty={(v) => v === 0} />
```

**Props:**

| Prop       | Type                 | Description                                                                 |
| ---------- | -------------------- | --------------------------------------------------------------------------- |
| `name`     | `string`             | The field's key in your values object                                       |
| `required` | `boolean`            | Flag it as required — a write check will complain if it's empty             |
| `isEmpty`  | `(value) => boolean` | Override what "empty" means for this field (default: `null` or `undefined`) |
| `children` | rule components      | `<Requires>`, `<Disables>`, or `<FairWhen>` go here                         |

---

### `<Requires>`

A child of `<Field>`. Makes this field **disabled** until its dependency is satisfied (and optionally, until that dependency has a specific value).

```tsx
// Enabled only when dep has any value
<Requires dep="hasPromo" />

// Enabled only when dep equals a specific value
<Requires dep="memberType" eq="premium" />

// Enabled only when dep is in a set of values
<Requires dep="plan" in={['pro', 'enterprise']} />

// Enabled when dep is above a threshold
<Requires dep="score" gt={100} />

// Combined range (both conditions must be true)
<Requires dep="age" gte={18} lte={65} />

// Multi-field condition using an expression (no dep needed)
import { expr } from '@umpire/dsl'

<Requires when={expr.and(expr.eq('memberType', 'premium'), expr.gte('age', 60))} />

// With a human-readable reason
<Requires dep="memberType" eq="premium" reason="Premium members only" />
```

**Value props:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `truthy`, `falsy`

Use `when` (from `@umpire/dsl`) when your condition spans multiple fields. You can't use `when` together with `dep` or any value props.

A field can have multiple `<Requires>` children — all of them must be satisfied for the field to be enabled (they are ANDed together).

---

### `<Disables>`

A child of `<Field>`. When this field holds a value, it disables the listed fields.

```tsx
<Field name="guestCheckout">
  <Disables fields={['accountEmail', 'accountPassword']} />
</Field>
```

**Props:**

| Prop     | Type       | Description                                             |
| -------- | ---------- | ------------------------------------------------------- |
| `fields` | `string[]` | Names of fields to disable while this field has a value |
| `reason` | `string`   | Optional explanation shown on the disabled fields       |

---

### `<StandaloneDisables>`

A **top-level sibling** of `<Field>` (not a child). Same idea as `<Disables>`, but useful when you don't want to nest the rule inside the source field — for example when the source field is defined elsewhere or the relationship feels like a cross-cutting concern.

```tsx
<Umpire>
  <Field name="adminMode" />
  <Field name="userEmail" />
  <Field name="userPassword" />
  <StandaloneDisables
    source="adminMode"
    fields={['userEmail', 'userPassword']}
    reason="Admin mode disables user settings"
  />
</Umpire>
```

**Props:**

| Prop     | Type       | Description                                               |
| -------- | ---------- | --------------------------------------------------------- |
| `source` | `string`   | The field that, when it has a value, triggers the disable |
| `fields` | `string[]` | Names of fields to disable                                |
| `reason` | `string`   | Optional explanation                                      |

---

### `<FairWhen>`

A child of `<Field>`. Marks a field's value as **foul** (invalid) when your check function returns `false`. Only fires when the field is satisfied (has a value) — it won't complain about empty fields.

```tsx
<Field name="age" required>
  <FairWhen check={(v) => Number(v) >= 0} reason="Age cannot be negative" />
</Field>
```

**Props:**

| Prop     | Type                 | Description                                                    |
| -------- | -------------------- | -------------------------------------------------------------- |
| `check`  | `(value) => boolean` | Called with the field's value. Return `false` to mark it foul. |
| `reason` | `string`             | Optional explanation shown when the value is foul              |

---

### `<OneOf>`

A **top-level sibling** of `<Field>`. Enforces mutual exclusivity across branches — when any field in a branch has a value, all fields in the other branches are disabled.

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

Once `creditCard` gets a value, `bankTransfer` and `paypal` are automatically disabled. Clear `creditCard` and they come back.

**Props:**

| Prop     | Type                       | Description                                                                                          |
| -------- | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `name`   | `string`                   | A name for this exclusivity group                                                                    |
| `groups` | `Record<string, string[]>` | Branch definitions — each key is a branch name, each value is an array of field names in that branch |

## tsconfig Setup

There are two ways to configure the pragma. Pick one.

### Option A: Per-file pragma comments (no tsconfig change needed)

Add these two comment lines at the very top of each `.tsx` file that uses `@umpire/jsx`:

```tsx
/** @jsxRuntime automatic */
/** @jsxImportSource @umpire/jsx */
```

### Option B: Project-wide tsconfig

Add these two options to your `tsconfig.json` `compilerOptions` so you don't need the comment lines at all:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@umpire/jsx"
  }
}
```

(But like... that would make it pretty hard to write React components so maybe don't do it that way. You _can_ but that doesn't mean you _should_.)

Either way, no React import needed — `@umpire/jsx` ships its own JSX runtime.

## See Also

- [`@umpire/core`](https://github.com/sdougbrown/umpire/tree/main/packages/core) — the plain-function API that `@umpire/jsx` compiles down to. Start here if JSX isn't your thing.
- [`@umpire/dsl`](https://github.com/sdougbrown/umpire/tree/main/packages/dsl) — expression helpers like `expr.and()`, `expr.eq()`, etc., used with the `when` prop on `<Requires>`.

For Sully ❤️
