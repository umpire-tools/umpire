# @umpire/devtools

In-app inspector for Umpire. Mounts a Shadow DOM panel that subscribes to registered ump instances and lets you inspect availability, challenge traces, foul logs, and the structural dependency graph — without printing or asserting by hand.

[Docs](https://umpire.tools/extensions/devtools/)

## Install

```bash
yarn add -D @umpire/devtools
```

## Quick Start

**Mount the panel once** at your app root:

```ts
if (import.meta.env.DEV) {
  const { mount } = await import('@umpire/devtools')
  mount()
}
```

**Register each ump instance** alongside `ump.check()`:

```ts
import { register } from '@umpire/devtools'

register('checkout', ump, values, conditions)
const availability = ump.check(values, conditions)
```

Or use the React hook (identical signature to `useUmpire` from `@umpire/react`):

```ts
import { useUmpire } from '@umpire/devtools/react'

const { check, fouls } = useUmpire(ump, values, conditions)
```

## Production Safety

`mount()` and `register()` are both no-ops when `NODE_ENV === 'production'`. No scorecard computation runs, nothing is added to the registry. The only production concern is bundle size from static imports — use a dynamic import for `mount()` to avoid that entirely.

## Slim Build

If Preact is already in your bundle:

```ts
import { mount, register } from '@umpire/devtools/slim'
```

Marks Preact as external, saves ~4 KB.
