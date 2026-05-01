# @umpire/eslint-plugin

Lint rules that catch umpire mistakes at lint time: typo'd field names, inline instance creation, database-owned write fields, and logical impossibilities like self-disabling fields and circular requires chains.

Works with **ESLint ≥ 9** (flat config) and Oxlint JS plugins.

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

## Oxlint

Add the plugin to `jsPlugins`, then enable rules by full name:

```json
{
  "jsPlugins": ["@umpire/eslint-plugin"],
  "rules": {
    "@umpire/eslint-plugin/no-self-disable": "error"
  }
}
```

`eslint` is an optional peer dependency and is only needed when using ESLint directly.

## Rules

| Rule                     | Severity | What it catches                                                       |
| ------------------------ | -------- | --------------------------------------------------------------------- |
| `no-unknown-fields`      | `warn`   | Field names in rules that aren't declared in `fields`                 |
| `no-inline-umpire-init`  | `warn`   | `umpire()` called inside a component or hook body without `useMemo`   |
| `no-write-owned-fields`  | opt-in   | DB-owned fields in write candidates or missing Drizzle excludes       |
| `no-self-disable`        | `error`  | A field listed as both source and target of `disables()`              |
| `no-contradicting-rules` | `error`  | `requires`/`disables` pairs that make a field permanently unavailable |
| `no-circular-requires`   | `error`  | Circular `requires` chains where fields mutually depend on each other |

### `no-write-owned-fields`

Flags literal `checkCreate()` and `checkPatch()` candidates that submit
database-owned fields, and flags `fromDrizzleTable()` / `fromDrizzleModel()`
calls that do not explicitly exclude those fields.

```js
{
  rules: {
    '@umpire/no-write-owned-fields': ['warn', {
      fieldNames: ['id', 'createdAt', 'updatedAt'],
      checkWriteCandidates: true,
      checkDrizzleHelpers: true,
      writeHelpers: ['checkCreate', 'checkPatch'],
      drizzleHelpers: ['fromDrizzleTable', 'fromDrizzleModel'],
    }],
  },
}
```

## Docs

https://umpire.tools/extensions/eslint-plugin/
