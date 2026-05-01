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
