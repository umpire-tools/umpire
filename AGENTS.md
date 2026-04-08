# Umpire Contributor Guide

`AGENTS.md` is the canonical repo-level instruction file. Keep `CLAUDE.md` and `.cursor/rules/umpire.md` symlinked to this file so local tooling stays aligned.

## Repo Shape

- Umpire is a declarative field-availability engine for object-shaped state with interdependent options. It is not limited to forms.
- Root workspaces live in `packages/*`. `docs/` is a separate Astro/Starlight app and is not part of the root Yarn workspaces.
- Published packages: `core`, `react`, `signals`, `store`, `zustand`, `redux`, `tanstack-store`, `pinia`, `vuex`, `zod`, `json`, `reads`, `testing`, `devtools`.

## Build And Test

- Use Yarn 4 with `nodeLinker: node-modules`. Never use `npm` in this repo.
- Root commands: `yarn build`, `yarn test`, `yarn typecheck`, `yarn docs`, `yarn docs:build`.
- Most packages build with `tsc`; `@umpire/devtools` builds with `tsup`.
- Prefer `yarn turbo run test --filter=@umpire/<package>` for a single package.
- For docs edits, `cd docs && npx astro build` is the practical end-to-end check.

## Architecture

- `@umpire/core` owns pure logic, graph construction, evaluation, `umpire()`, `scorecard()`, and `challenge()`.
- `@umpire/store` is the subscription adapter foundation. `redux`, `pinia`, `tanstack-store`, and `vuex` normalize into it; `zustand` re-exports it because Zustand already fits the contract.
- `@umpire/react` is intentionally thin. `@umpire/signals` is the fine-grained reactive adapter.
- `@umpire/json`, `@umpire/zod`, `@umpire/reads`, `@umpire/testing`, and `@umpire/devtools` are optional helper packages layered on top of core.

## Behavior To Preserve

- Satisfaction is presence-based by default: only `null` and `undefined` are unsatisfied unless a field overrides `isEmpty`.
- When describing `fair: false`, say the field or value is `foul`, not `unfair`.
- `requires` checks both dependency satisfaction and dependency availability.
- `disables` and `oneOf` inspect source values only, not source availability.
- Multiple rules on the same target are ANDed; use `anyOf()` for OR behavior.
- Disabled fields must report `required: false`.
- `play()` suggests resets only for fields that became disabled and still hold stale values.
- `challenge()` and `scorecard()` are debugging surfaces, not app-state inputs.

## Contributor Notes

- ESM-only, `verbatimModuleSyntax`, `import type` and `export type`, and `.js` extensions in TypeScript import paths.
- Keep `@umpire/core` free of runtime dependencies.
- Package-level `AGENTS.md` files are intentionally short; keep them high-signal and keep their `.claude/rules/*` compatibility files pointing at the same content.
- Commit messages use an emoji prefix plus a descriptive summary.
