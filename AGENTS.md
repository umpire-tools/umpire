# Umpire Contributor Guide

`AGENTS.md` is the canonical repo-level instruction file. Keep `CLAUDE.md` and `.cursor/rules/umpire.md` symlinked to this file so local tooling stays aligned.

## Repo Shape

- Umpire is a declarative field-availability engine for object-shaped state with interdependent options. It is not limited to forms.
- Root workspaces live in `packages/*`. `docs/` is a separate Astro/Starlight app and is not part of the root Yarn workspaces.
- Published packages: `core`, `react`, `signals`, `store`, `zustand`, `redux`, `tanstack-store`, `pinia`, `vuex`, `zod`, `json`, `reads`, `testing`, `devtools`.

## Build And Test

**Always run commands from the repo root, through Yarn.** Never invoke `turbo`, `bun`, or `npm` directly — tests depend on Yarn workspace resolution and per-package `bunfig.toml` preloads; bypassing Yarn skips both.

| Task                     | Command                                |
| ------------------------ | -------------------------------------- |
| Build everything         | `yarn build`                           |
| Run all tests            | `yarn test`                            |
| Run one package's tests  | `yarn workspace @umpire/<pkg> test`    |
| Typecheck                | `yarn typecheck`                       |
| Docs dev server          | `yarn docs`                            |
| Docs build               | `yarn docs:build`                      |

### Never

- `turbo run test` or any bare `turbo` invocation — use `yarn test`, which wraps turbo with the correct config.
- `bun test` inside a package — use `yarn workspace @umpire/<pkg> test`; it shells to `bun test` with the right preload.
- `npm` for any reason — this repo is Yarn 4 with `nodeLinker: node-modules`. No `npm install`, no `npx`.

### Implementation notes

- `yarn test` → `turbo run test` → per-package `bun test`. Each package's `bunfig.toml` preloads `test/preload-workspace-aliases.ts`, which mocks `@umpire/*` subpaths so sibling packages don't need building first.
- When adding a new exported `@umpire/*` subpath used before build, add a matching `mock.module(...)` entry to `test/preload-workspace-aliases.ts`.
- Most packages build with `tsc`; `@umpire/devtools` builds with `tsdown`.
- Bun 1.2+ is required for tests. Yarn 4 is pinned via `packageManager`.
- For docs edits, `cd docs && yarn build` is the practical end-to-end check (`docs/` is not part of the root Yarn workspaces).
- `yarn turbo run test --filter=@umpire/<pkg>` only helps when you want dep-aware ordering; the `test` task has no `dependsOn`, so for tests it's equivalent to `yarn workspace`. Prefer the workspace form.

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

## Releases and Versioning

Changesets workflow with `.changeset/config.json`:
- `updateInternalDependencies: "minor"` ensures adapter packages get a patch bump when `core` bumps minor or major, triggering a new publish with updated dep ranges.
- All packages are kept in sync: when a referenced package bumps, dependents are re-published automatically.
- This maintains consistency without requiring a full major cascade on every internal change.

## Contributor Notes

- ESM-only, `verbatimModuleSyntax`, `import type` and `export type`, and `.js` extensions in TypeScript import paths.
- Keep `@umpire/core` free of runtime dependencies.
- Package-level `AGENTS.md` files are intentionally short; keep them high-signal and keep their `.claude/rules/*` compatibility files pointing at the same content.
- Commit messages use an emoji prefix plus a descriptive summary.

## Slop Scanner

- **`tests.duplicate-mock-setup` is a false positive** — umpire tests deliberately repeat the full `umpire({ fields, rules, ... })` call shape across tests to verify the public API is consistent and usable in a variety of configurations. Do not flag these as duplicate setup.
