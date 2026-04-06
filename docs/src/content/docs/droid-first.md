---
title: Droid-First Development
description: Umpire ships instructions for AI assistants, not just documentation for humans.
---

Most libraries document their API for humans and hope for the best when an AI assistant writes the integration code. Umpire takes a different approach: every package ships machine-readable rules that teach your AI assistant the correct patterns before it writes a single line.

We call this **droid-first** development. The docs are for you. The rules are for your copilot.

## What ships with `yarn add`

Each `@umpire/*` package includes a `.claude/rules/` directory. When you install Umpire, these files land in `node_modules` where Claude Code picks them up automatically.

Here's what `@umpire/core` teaches your assistant:

```
- Create an umpire with umpire({ fields, rules }).
- Do not drive availability with useEffect; derive it
  from ump.check(values, conditions?) during render.
- Use play(before, after) for transition-time reset
  recommendations, not on every render.
- requires checks both value satisfaction and availability.
- disables and oneOf check source values only, not
  source availability.
- Use fairWhen for relational value appropriateness —
  when a field's current value may no longer fit given
  upstream changes. Do not use enabledWhen with a
  conditions boolean to fake this check.
- field<V>('name') gives fairWhen predicates a typed
  value parameter instead of unknown.
```

And `@umpire/react`:

```
- Use useUmpire(ump, values, conditions?) to derive
  availability inside React components.
- Do not use useEffect to react to availability changes;
  availability is derived each render.
- fouls come from ump.play() comparing the current render
  snapshot to the previous one.
```

No prompt engineering required. Your assistant reads these rules the moment it touches your codebase.

## What this means in practice

Without droid-first rules, an AI assistant writing Umpire integration code will probably:

1. Wrap `check()` in a `useEffect` and sync it to state
2. Call `play()` on every render instead of on transitions
3. Store availability in a `useState` instead of deriving it
4. Spread the reactive proxy and defeat fine-grained signal tracking

These are the exact mistakes that are easy to make and hard to debug. The per-package rules prevent all four — the assistant knows the correct pattern before it starts writing.

## Store and adapter packages, covered

| Package | Rule file | Key guidance |
| --- | --- | --- |
| `@umpire/core` | `.claude/rules/umpire-core.md` | Satisfaction semantics, rule evaluation order, `check()` vs `play()` vs `challenge()` |
| `@umpire/store` | `.claude/rules/umpire-store.md` | Strict `fromStore()` contract, `select()` as the aggregation point, no loose subscribe signatures |
| `@umpire/react` | `.claude/rules/umpire-react.md` | `useUmpire` hook, no `useEffect`, snapshot tracking is internal |
| `@umpire/redux` | `.claude/rules/umpire-redux.md` | `fromReduxStore()`, internal `prevState` tracking, same `UmpireStore` surface |
| `@umpire/signals` | `.claude/rules/umpire-signals.md` | `reactiveUmp()`, no spread on proxy, `effect()` required for fouls |
| `@umpire/tanstack-store` | `.claude/rules/umpire-tanstack-store.md` | `fromTanStackStore()`, previous `.state` snapshots, same `select()` pattern |
| `@umpire/zustand` | `.claude/rules/umpire-zustand.md` | `fromStore()`, native `subscribe(next, prev)`, no manual prev tracking |

## For contributors

The repo's `CLAUDE.md` is the canonical instruction source. It's symlinked to `AGENTS.md` and `.cursor/rules/umpire.md` so that Claude Code, Codex, and Cursor all receive identical guidance from a single file.

```
CLAUDE.md              ← canonical source
AGENTS.md              → symlink to CLAUDE.md
.cursor/rules/umpire.md → symlink to CLAUDE.md
```

One source of truth. Three agents. No drift.

## Why bother?

AI assistants are going to write integration code against your library whether you guide them or not. The question is whether they'll write it correctly.

Shipping `.claude/rules/` files is cheap — a few hundred bytes of plain text per package. The payoff is that every developer using Claude Code, Cursor, or Codex with your library gets correct patterns by default, without reading the docs first, without trial and error, without a Stack Overflow detour.

The docs are still here for the humans. But the droids get first-class support too.

---

<small>This page was written by Claude. 😉</small>
