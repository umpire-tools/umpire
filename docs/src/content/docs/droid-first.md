---
title: Droid-First Development
description: Umpire ships instructions for AI assistants, not just documentation for humans.
---

Most libraries document their API for humans and hope for the best when an AI assistant writes the integration code. Umpire takes a different approach: every package ships a tiny agent-facing instruction file that teaches the correct integration patterns before a single line gets written.

We call this **droid-first** development. The docs are for you. The rules are for your copilot.

## What ships with `yarn add`

Each published `@umpire/*` package includes:

- `AGENTS.md` as the canonical, cross-tool instruction file
- `.claude/rules/umpire-*.md` as a Claude-oriented compatibility file generated from the same source

That keeps the hints discoverable without making them long. The goal is "small and useful," not "more docs, but for robots."

Here is the kind of guidance `@umpire/core` ships:

```
- Create an umpire with umpire({ fields, rules }).
- Satisfaction is presence-based by default; use isEmpty
  only when your domain needs a stricter empty check.
- requires checks both value satisfaction and availability.
- disables and oneOf check source values only, not
  source availability.
- Rules on the same target are ANDed; use anyOf(...)
  for OR logic.
- Use play(before, after) only for transition-time reset
  suggestions, not on every render.
```

And `@umpire/react`:

```
- Use useUmpire(ump, values, conditions?) to derive
  availability inside React components.
- check is derived each render; do not mirror it into
  React state or recompute it in useEffect.
- fouls are transition-time recommendations from the
  previous snapshot; the hook tracks that internally.
```

And `@umpire/solid`:

```
- Use useUmpire(ump, values, conditions?) inside Solid
  components for local state.
- Use fromSolidStore(ump, { values, set, conditions? }) when
  the form lives in shared store or context state.
- check() and fouls() are accessors; read them directly instead
  of mirroring them into other state.
```

No prompt engineering required. Agents that look for `AGENTS.md` get the canonical file. Claude-oriented tooling still finds the compatibility rule file in the installed package.

## What this means in practice

Without droid-first rules, an AI assistant writing Umpire integration code will probably:

1. Wrap `check()` in a `useEffect` and sync it to state
2. Call `play()` on every render instead of on transitions
3. Store availability in a `useState` instead of deriving it
4. Spread the reactive proxy and defeat fine-grained signal tracking

These are the exact mistakes that are easy to make and hard to debug. The package-level agent hints prevent all four without wasting a big chunk of the consumer's context window.

## Package coverage

| Package | Canonical file | Key guidance |
| --- | --- | --- |
| `@umpire/core` | `AGENTS.md` | Satisfaction semantics, `requires` vs `disables`, `check()` vs `play()` vs `challenge()` |
| `@umpire/react` | `AGENTS.md` | `useUmpire()`, derived render-time availability, internal previous-snapshot tracking |
| `@umpire/solid` | `AGENTS.md` | `useUmpire()`, `fromSolidStore()`, direct accessor reads, shared store integration |
| `@umpire/signals` | `AGENTS.md` | `reactiveUmp()`, fine-grained reads, `effect()` requirement for fouls |
| `@umpire/store` | `AGENTS.md` | Strict `fromStore()` contract, `select()` as the aggregation point |
| `@umpire/zustand` | `AGENTS.md` | Native `fromStore()` fit, no manual previous-state bookkeeping |
| `@umpire/redux` | `AGENTS.md` | `fromReduxStore()`, internal previous-state tracking |
| `@umpire/pinia` | `AGENTS.md` | `fromPiniaStore()`, `$state` snapshotting before delegation |
| `@umpire/tanstack-store` | `AGENTS.md` | `fromTanStackStore()`, previous `.state` snapshotting |
| `@umpire/vuex` | `AGENTS.md` | `fromVuexStore()`, state snapshotting before delegation |
| `@umpire/zod` | `AGENTS.md` | Active-schema composition and error filtering for enabled fields only |
| `@umpire/json` | `AGENTS.md` | Portable rule round-tripping, named checks, `excluded` preservation |
| `@umpire/reads` | `AGENTS.md` | Memoized reads, read-backed rule bridges, direct-dependency inspection |
| `@umpire/testing` | `AGENTS.md` | Structural invariant probing with `monkeyTest()` |
| `@umpire/devtools` | `AGENTS.md` | Dev-only panel mounting, registration, reads inspection |

## For contributors

The repo's `AGENTS.md` is the canonical instruction source. `CLAUDE.md` and `.cursor/rules/umpire.md` should stay symlinked to it so Claude Code, Codex, and Cursor all receive identical guidance from a single file.

```
AGENTS.md               ← canonical source
CLAUDE.md               → symlink to AGENTS.md
.cursor/rules/umpire.md → symlink to AGENTS.md
```

One source of truth. Three agents. No drift.

## Why bother?

AI assistants are going to write integration code against your library whether you guide them or not. The question is whether they'll write it correctly.

Shipping a tiny `AGENTS.md` file per package is cheap. The payoff is that developers using Claude Code, Cursor, Codex, or anything else that respects `AGENTS.md` get correct patterns by default, without reading the docs first, without trial and error, and without burning context on a wall of prose.

The docs are still here for the humans. But the droids get first-class support too.

---

<small>This page was written by Claude. 😉</small>
