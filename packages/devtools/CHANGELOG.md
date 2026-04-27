# @umpire/devtools

## 1.0.0

### Minor Changes

- 8cb1eec: Expose rule inspection and live coverage tracking in devtools
  - `RegistryEntry` now includes `rules` (`AnyRuleEntry[]`), `activeRuleIds` (rules currently failing this render), and `coverage` (accumulated field-state and rule-hit data for the session)
  - `ChallengeDrawer` shows the stable `ruleId` on each reason entry, linking the "why" directly to the rule that caused it
  - New built-in **rules** tab: lists every configured rule with its kind, stable ID, and a human-readable description; highlights rules that are actively failing in the current render
  - New built-in **coverage** tab: tracks which field states (enabled/disabled/fair/foul/satisfied/unsatisfied) and which rules have been exercised since the panel was mounted; surfaces uncovered rules so you can spot dead constraints while using the app

### Patch Changes

- 9b30e1c: Improve devtools panel responsiveness by avoiding eager reads-extension materialization, deduplicating identical register() calls, and capping initial reads tab rendering.
- 87c5920: Migrate the devtools package build from tsup to tsdown while preserving the existing standalone and slim/react bundle behavior.
- fee01cf: code formatting & type adjustments for better consistency
- 82fdd4b: Clean up duplicated internals across adapters and JSON tooling by sharing guards, JSON clone helpers, and store previous-state tracking, while simplifying reactive and snapshot plumbing.

  Also tighten package metadata by marking `react` as an optional peer for `@umpire/devtools`.

- 4eecbeb: Loosen `InputValues` from a generic `FieldValues<F>` alias to `Record<string, unknown>`. Consumer call sites (`check()`, `play()`, `useUmpire()`, adapters) no longer require casts when passing form state or dynamic records. Predicate callbacks keep `FieldValues<F>` for typed field access. Remove phantom `F` parameter from `Snapshot` — only `C` (conditions) is structurally used.
- 4d8bd6c: adjusted publishing setup for `.claude` rules (i don't even honestly know if this kind of thing works. hopefully it's helpful!)
- Updated dependencies [135e347]
- Updated dependencies [5b6ab7d]
- Updated dependencies [39be228]
- Updated dependencies [9bc562b]
- Updated dependencies [86280aa]
- Updated dependencies [fee01cf]
- Updated dependencies [82fdd4b]
- Updated dependencies [4eecbeb]
- Updated dependencies [4d8bd6c]
- Updated dependencies [7fb75bf]
- Updated dependencies [aad8d17]
- Updated dependencies [0904040]
- Updated dependencies [31bc71c]
- Updated dependencies [6060d47]
- Updated dependencies [17dea80]
- Updated dependencies [bff4c43]
- Updated dependencies [19fdbfe]
- Updated dependencies [8eaa826]
- Updated dependencies [17bd119]
  - @umpire/core@1.0.0
  - @umpire/reads@1.0.0

## 0.1.0-alpha.10

### Patch Changes

- c57b61e: - `@umpire/devtools` now includes a dedicated `conditions` tab and a generalized extension API for custom devtools tabs.
  - `@umpire/devtools` keeps `reads` support as backwards-compatible sugar on top of the new extension system.
  - `@umpire/zod` now exposes `@umpire/zod/devtools`, a validation-tab helper for `@umpire/devtools`.
  - `@umpire/zod/devtools` can surface active validation errors, suppressed issues, unmapped issues, and active schema fields.
  - `@umpire/zod/devtools` supports a context-driven `resolve(...)` mode so validation tabs can derive from devtools inspect context and `scorecard.check` without a direct dependency on `@umpire/devtools`.
- 73cd485: - Add a shared `snapshotValue()` helper at `@umpire/core/snapshot` for cloning previous plain-data snapshots without changing custom-instance comparison semantics.
  - Use shared snapshotting across the React, devtools, signals, Pinia, Vuex, Redux, and TanStack Store integrations so in-place nested plain-object mutations do not rewrite the saved "before" snapshot.
- 1fcfe46: - Add `eitherOf(groupName, branches)`, a new core rule helper for named OR paths where each branch is a group of ANDed rules.
  - `eitherOf()` supports both availability and fairness constraints, validates that inner rules share the same targets and constraint, and allows multiple branches to pass at once.
  - `challenge()` and `inspectRule()` now preserve `eitherOf()` branch structure so named paths are visible in debugging output.
  - `@umpire/devtools` now renders `eitherOf()` branch groups in the challenge drawer so named paths are readable during inspection.
- Updated dependencies [e570cac]
- Updated dependencies [73cd485]
- Updated dependencies [1fcfe46]
  - @umpire/core@1.0.0

## 0.1.0-alpha.9

### Minor Changes

- Alternate React hook for devtools panel
- Registry coverage tests expanded
- Panel state sync cleanup

## 0.1.0-alpha.8

_Version skipped (internal; first published in alpha.9 pipeline)_

### Minor Changes

- Initial release: debug panel for inspecting umpire field state in real time
- Debug panel added to all example pages
- Panel state sync with live umpire instance
