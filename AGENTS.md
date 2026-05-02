# Umpire Contributor Guide

`AGENTS.md` is the canonical repo-level instruction file. Keep `CLAUDE.md` and `.cursor/rules/umpire.md` symlinked to this file so local tooling stays aligned.

## Repo Shape

- Umpire is a declarative field-availability engine for object-shaped state with interdependent options. It is not limited to forms.
- Root workspaces live in `packages/*`. `docs/` is a separate Astro/Starlight app and is not part of the root Yarn workspaces.
- Published packages: `core`, `react`, `signals`, `store`, `zustand`, `redux`, `tanstack-store`, `pinia`, `vuex`, `zod`, `json`, `reads`, `write`, `drizzle`, `testing`, `devtools`.

## Build And Test

Canonical commands and single-package iteration workflows live in [`CONTRIBUTING.md`](./CONTRIBUTING.md). Check there first.

Quick reference (root): `yarn test`, `yarn build`, `yarn typecheck`.

**Never** invoke `turbo`, `bun`, or `npm` directly — use the Yarn wrappers. Tests depend on Yarn workspace resolution and per-package `bunfig.toml` preloads; bypassing Yarn skips both.

## Architecture

- `@umpire/core` owns pure logic, graph construction, evaluation, `umpire()`, `scorecard()`, and `challenge()`.
- `@umpire/store` is the subscription adapter foundation. `redux`, `pinia`, `tanstack-store`, and `vuex` normalize into it; `zustand` re-exports it because Zustand already fits the contract.
- `@umpire/react` is intentionally thin. `@umpire/signals` is the fine-grained reactive adapter.
- `@umpire/json`, `@umpire/zod`, `@umpire/reads`, `@umpire/write`, `@umpire/drizzle`, `@umpire/testing`, and `@umpire/devtools` are optional helper packages layered on top of core.

## Behavior To Preserve

- Satisfaction is presence-based by default: only `null` and `undefined` are unsatisfied unless a field overrides `isEmpty`.
- When describing `fair: false`, say the field or value is `foul`, not `unfair`.
- `requires` checks both dependency satisfaction and dependency availability.
- `disables` and `oneOf` inspect source values only, not source availability.
- Multiple rules on the same target are ANDed; use `anyOf()` for OR behavior.
- Disabled fields must report `required: false`.
- `play()` suggests resets only for fields that became disabled and still hold stale values.
- `challenge()` and `scorecard()` are debugging surfaces, not app-state inputs.

## `requires` vs `required` — Critical Distinction

`requires(target, dep)` controls **`enabled`**, not **`required`**. These are separate axes:

- `enabled` — whether the field is available for input right now.
- `required` — whether a missing value should be flagged as an issue.

`required` in the availability map only becomes `true` when the **FieldDef itself** has `required: true` (e.g. a Drizzle column with `notNull()` and no default). The `requires` rule makes the target field enabled when its dependency is met — it does not change `required`.

**Consequence for write checks** (`@umpire/write`): a write issue fires only when `enabled && required && !satisfied`. An enabled-but-not-required absent field produces no issue. To block a write on a missing conditional field, the field's FieldDef must have `required: true`.

**Consequence for rule design**: `requires('field', predicate)` is primarily a conditional enable/disable. When the predicate is false the field is disabled; when true it is enabled. Blocking on a missing value additionally requires `required: true` in the FieldDef.

## Debugging With `challenge()` and `scorecard()`

When a rule evaluation produces unexpected results, reach for these tools first — before reading source:

- **`ump.challenge(fieldName, values)`** — explains exactly which rules affected a field and why. Safe to call with a partial values object; pass `null` for fields you don't care about.
- **`ump.scorecard(values)`** — requires **all field keys** to be present; pass `null` for optional ones. Errors if any key referenced by the evaluator is missing.
- **`ump.check(values, context?)`** — safe with partial values; returns the full availability map. Use this to inspect the state of every field at once.

The right debug sequence when a result is surprising:

```ts
// 1. What does umpire think about this specific field?
console.log(ump.challenge('fieldName', fullValues))

// 2. What is the full availability picture?
console.log(ump.check(fullValues))
```

Do not read rule source or `dist/` to guess evaluation behavior — use `challenge()` to get ground truth.

## Releases and Versioning

Changesets workflow with `.changeset/config.json`:

- `updateInternalDependencies: "minor"` ensures adapter packages get a patch bump when `core` bumps minor or major, triggering a new publish with updated dep ranges.
- All packages are kept in sync: when a referenced package bumps, dependents are re-published automatically.
- This maintains consistency without requiring a full major cascade on every internal change.

## Contributor Notes

- ESM-only, `verbatimModuleSyntax`, `import type` and `export type`, and `.js` extensions in TypeScript import paths.
- Keep `@umpire/core` free of runtime dependencies.
- Package-level `AGENTS.md` files are intentionally short; keep them high-signal and keep their `.claude/rules/*` compatibility files pointing at the same content.
- Workflow details (commit conventions, changesets, single-package iteration) live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Slop Scanner

- **`tests.duplicate-mock-setup` is a false positive** — umpire tests deliberately repeat the full `umpire({ fields, rules, ... })` call shape across tests to verify the public API is consistent and usable in a variety of configurations. Do not flag these as duplicate setup.
