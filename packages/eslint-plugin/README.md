# @umpire/eslint-plugin

ESLint rules that catch umpire mistakes at lint time: typo'd field names, inline instance creation, and logical impossibilities like self-disabling fields and circular requires chains.

Requires **ESLint ≥ 9** (flat config only).

## Install

```bash
npm install --save-dev @umpire/eslint-plugin
```

## Setup

Add the recommended config to your `eslint.config.js`:

```js
import umpire from '@umpire/eslint-plugin'

export default [
  umpire.configs.recommended,
  // ... rest of your config
]
```

## Rules

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `no-unknown-fields` | `warn` | Field names in rules that aren't declared in `fields` |
| `no-inline-umpire-init` | `warn` | `umpire()` called inside a component or hook body without `useMemo` |
| `no-self-disable` | `error` | A field listed as both source and target of `disables()` |
| `no-contradicting-rules` | `error` | `requires`/`disables` pairs that make a field permanently unavailable |
| `no-circular-requires` | `error` | Circular `requires` chains where fields mutually depend on each other |

## Docs

https://sdougbrown.github.io/umpire/extensions/eslint-plugin/
