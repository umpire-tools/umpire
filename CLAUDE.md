# Umpire Contributor Guide

This file is the canonical project instruction source for the repo. `AGENTS.md` and `.cursor/rules/umpire.md` should stay symlinked to this file so Claude, Codex, and Cursor all receive the same guidance.

## Project Overview

Umpire (`@umpire/*`) is a declarative field-availability engine for any state with interdependent options — forms, game boards, config panels, permission matrices, anything that fits a plain object with fields and rules.

Packages and apps:
- `@umpire/core` - pure logic, zero dependencies
- `@umpire/signals` - signal adapter via `SignalProtocol`, wraps any signal library
- `@umpire/react` - `useUmpire` hook, thin wrapper using `useMemo` + `useRef`
- `@umpire/zustand` - `fromStore` adapter, uses Zustand's native `subscribe(next, prev)`
- `@umpire/zod` - Zod-backed rule helpers/integration
- `docs/` - Astro/Starlight docs app with interactive demos; not part of the root Yarn workspaces/turbo pipeline

Tooling:
- Yarn 4 with `turbo` for workspace packages
- TypeScript only, compiled with `tsc` (no bundler)
- ESM-only packages
- Jest + `ts-jest`
- Astro/Starlight for the docs app

## Commands

```bash
yarn install
yarn build          # tsc via turbo
yarn docs           # Astro dev server in /docs
yarn docs:build     # Astro production build in /docs
yarn test           # jest via turbo
yarn typecheck      # tsc --noEmit via turbo
```

## Package Manager

- Use Yarn 4 with `nodeLinker: node-modules`
- Root workspaces are `packages/*`; `docs/` is a separate package/app
- Never use `npm`

## Architecture

- `@umpire/core` owns all pure logic: types, rules, graph, evaluator, and `umpire()` factory
- `@umpire/signals` adapts Umpire to a signal implementation through `SignalProtocol`
- `@umpire/react` exposes the `useUmpire` hook with minimal React-specific state handling
- `@umpire/zustand` connects a store through selectors and native previous-state subscriptions
- `@umpire/zod` provides schema-oriented rule helpers for Zod users
- `docs/` consumes packages via local portal dependencies and is the main place prototype flows and examples are exercised

## Key Concepts

- Field satisfaction is presence-based by default: any value other than `null` or `undefined` is satisfied
- `isEmpty` on a field overrides the default satisfaction check
- `requires` checks both dependency value satisfaction and dependency availability, so transitive disables propagate
- `disables` and `oneOf` check value satisfaction only, not dependency availability
- Treat `disables` and `oneOf` as recommendations, not mutations
- Evaluation runs in topological order from a structural dependency graph built at creation time
- Predicates receive field values and optional context, not availability state
- Multiple rules targeting the same field are ANDed; use `anyOf` for OR behavior
- Declaration order controls reason precedence when multiple rules fail
- A disabled field must report `required: false`, even if the field is declared required
- `play()` recommends resets only for fields that became disabled, still have a non-empty value, and differ from the suggested value
- `challenge()` is debug-only introspection: direct rule trace, transitive dependencies, and `oneOf` resolution details

## Testing

- Test runner: Jest + `ts-jest`
- ESM test mode requires `NODE_OPTIONS='--experimental-vm-modules'`
- Tests live in `__tests__/*.test.ts` within each package
- `yarn test` runs all package test suites from the repo root through `turbo`
- For a single package test run, prefer `yarn turbo run test --filter=@umpire/<package>` so the root Jest toolchain is available
- For docs changes, `cd docs && npx astro build` is the practical end-to-end validation pass
- Strict docs `tsc` has known unrelated noise from React/Preact coexistence; when validating docs edits, prefer a focused filtered `tsc --noEmit` check on the touched files rather than treating whole-program docs `tsc` output as gating

## Code Style

- ESM-only with `verbatimModuleSyntax`
- Use `export type` and `import type` where appropriate
- Use `.js` extensions in TypeScript import paths
- Keep `@umpire/core` free of external runtime dependencies
- Commit messages use an emoji prefix and a descriptive summary
