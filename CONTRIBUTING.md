# Contributing to Umpire

Thanks for contributing! This guide covers setup, the commands you'll need, and the conventions we follow.

> **For agents:** this file is the canonical reference for repo commands and workflows. `AGENTS.md` covers architecture and code-correctness constraints; commands live here.

## Prerequisites

- **Node 22+** (see `engines` in `package.json`).
- **Yarn 4** — pinned via `packageManager`. Run `corepack enable` once if Yarn 4 isn't already active; Corepack ships with Node.
- **Bun 1.2+** — tests run on Bun, not Node. Install from <https://bun.sh>.

`nodeLinker: node-modules` is set in `.yarnrc.yml`; don't switch to PnP.

## Build and test

**Always run commands from the repo root, through Yarn.** Never invoke `turbo`, `bun`, or `npm` directly — tests depend on Yarn workspace resolution and per-package `bunfig.toml` preloads; bypassing Yarn skips both.

| Task                    | Command                             |
| ----------------------- | ----------------------------------- |
| Build everything        | `yarn build`                        |
| Run all tests           | `yarn test`                         |
| Run one package's tests | `yarn workspace @umpire/<pkg> test` |
| Typecheck               | `yarn typecheck`                    |
| Docs dev server         | `yarn docs`                         |
| Docs build              | `yarn docs:build`                   |

### Never

- `turbo run test` or any bare `turbo` invocation — use `yarn test`, which wraps turbo with the right config.
- `bun test` inside a package — use `yarn workspace @umpire/<pkg> test`; it shells to `bun test` with the right preload.
- `npm` for any reason — this repo is Yarn 4 only. No `npm install`, no `npx`.

### How it fits together

`yarn test` → `turbo run test` → per-package `bun test`. Each package's `bunfig.toml` preloads `test/preload-workspace-aliases.ts`, which mocks `@umpire/*` subpaths so sibling packages don't need building first.

Most packages build with `tsc`; `@umpire/devtools` builds with `tsdown`. For docs edits, `cd docs && yarn build` is the practical end-to-end check (`docs/` is not part of the root Yarn workspaces).

## Iterating on a single package

`yarn workspace @umpire/<pkg> test` runs only that package's tests and forwards extra args to `bun test`:

| Need                          | Command                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| Single test file              | `yarn workspace @umpire/<pkg> test path/to/file.test.ts`                |
| Filter by test name           | `yarn workspace @umpire/<pkg> test -t "pattern"`                        |
| Watch mode                    | `yarn workspace @umpire/<pkg> test --watch`                             |
| Disable workspace alias mocks | `BUN_DISABLE_WORKSPACE_MOCKS=true yarn workspace @umpire/<pkg> test`    |

### Heads-up: "isolated" means test scope, not dependency isolation

Each package's `bunfig.toml` preloads `test/preload-workspace-aliases.ts`, which mocks `@umpire/*` to sibling **`src/`** directories — not `dist/`. So if `@umpire/core/src` is broken, your `@umpire/react` test run will see it.

This is intentional: tests run against current source without needing a build step. If you want to test a package against a frozen upstream build instead, set `BUN_DISABLE_WORKSPACE_MOCKS=true` and build the upstream package first.

### Turbo filter (rarely needed for tests)

`yarn turbo run test --filter=@umpire/<pkg>` only helps when you want dep-aware ordering. The `test` task in `turbo.json` has no `dependsOn`, so for tests it's equivalent to the `yarn workspace` form above. Prefer `yarn workspace` for clarity.

## Coverage

- `yarn test:coverage` — merged lcov via Bun.
- `yarn test:coverage:istanbul` — istanbul-based, for tooling that doesn't read Bun lcov.

## Adding a new exported `@umpire/*` subpath

If you add a new exported subpath that sibling package tests import **before** the package is built, add a matching `mock.module(...)` entry to `test/preload-workspace-aliases.ts`. Otherwise tests fail at import time — the preload doesn't auto-discover subpaths.

## Changesets

Add a changeset with `yarn changeset` for any user-facing change. `.changeset/config.json` is configured with `updateInternalDependencies: "minor"`, so adapter packages get an automatic patch bump and republish when `core` bumps minor or major. You don't need separate changesets for downstream packages unless the change is in that package itself.

## Commits

Commits use an emoji prefix plus a descriptive summary. Browse `git log` for the conventions actually in use, but the common prefixes are:

- ✨ `feat` — new feature
- 🐛 `fix` — bug fix
- ⚡️ `perf` — performance improvement
- ♻️ `refactor` — refactor without behavior change
- 🧹 `chore` — cleanup / non-functional tidy
- 📝 `docs` — documentation
- ✅ `test` — tests
