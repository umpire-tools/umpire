---
'@umpire/devtools': minor
---

Expose rule inspection and live coverage tracking in devtools

- `RegistryEntry` now includes `rules` (`AnyRuleEntry[]`), `activeRuleIds` (rules currently failing this render), and `coverage` (accumulated field-state and rule-hit data for the session)
- `ChallengeDrawer` shows the stable `ruleId` on each reason entry, linking the "why" directly to the rule that caused it
- New built-in **rules** tab: lists every configured rule with its kind, stable ID, and a human-readable description; highlights rules that are actively failing in the current render
- New built-in **coverage** tab: tracks which field states (enabled/disabled/fair/foul/satisfied/unsatisfied) and which rules have been exercised since the panel was mounted; surfaces uncovered rules so you can spot dead constraints while using the app
