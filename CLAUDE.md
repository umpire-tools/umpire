# Umpire Contributor Guide

This file is the canonical project instruction source for the repo. `AGENTS.md` and `.cursor/rules/umpire.md` should stay symlinked to this file so Claude, Codex, and Cursor all receive the same guidance.

## Project Overview

Umpire (`@umpire/*`) is a declarative field-availability engine for any state with interdependent options — forms, game boards, config panels, permission matrices, anything that fits a plain object with fields and rules.

Monorepo packages:
- `@umpire/core` - pure logic, zero dependencies
- `@umpire/signals` - signal adapter via `SignalProtocol`, wraps any signal library
- `@umpire/react` - `useUmpire` hook, thin wrapper using `useMemo` + `useRef`
- `@umpire/zustand` - `fromStore` adapter, uses Zustand's native `subscribe(next, prev)`

Tooling:
- Yarn 4 workspaces with `turbo`
- TypeScript only, compiled with `tsc` (no bundler)
- ESM-only packages
- Jest + `ts-jest`

## Commands

```bash
yarn install
yarn build          # tsc via turbo
yarn test           # jest via turbo
yarn typecheck      # tsc --noEmit via turbo
```

## Package Manager

- Use Yarn 4 with `nodeLinker: node-modules`
- Never use `npm`

## Architecture

- `@umpire/core` owns all pure logic: types, rules, graph, evaluator, and `umpire()` factory
- `@umpire/signals` adapts Umpire to a signal implementation through `SignalProtocol`
- `@umpire/react` exposes the `useUmpire` hook with minimal React-specific state handling
- `@umpire/zustand` connects a store through selectors and native previous-state subscriptions

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

## Code Style

- ESM-only with `verbatimModuleSyntax`
- Use `export type` and `import type` where appropriate
- Use `.js` extensions in TypeScript import paths
- Keep `@umpire/core` free of external runtime dependencies
- Commit messages use an emoji prefix and a descriptive summary
