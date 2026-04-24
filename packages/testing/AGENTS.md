# @umpire/testing

## monkeyTest

- Use `monkeyTest(ump, options?)` in tests and assert on the returned `passed` flag or `violations`.
- Configs with 6 or fewer fields are tested exhaustively; larger configs are sampled with a seeded PRNG.
- Pass representative `conditions` snapshots when rules depend on external context.
- Violations are structural invariant failures, not user-facing validation errors.

## checkAssert

- Use `checkAssert(ump.check(values))` for readable scenario-level assertions on field availability.
- Methods: `.enabled()`, `.disabled()`, `.fair()`, `.foul()`, `.required()`, `.optional()`, `.satisfied()`, `.unsatisfied()`.
- All methods accept variadic field names and return the chain for further assertions.
- Disabled fields always have `fair: true`; `.foul()` therefore only fires for enabled fields with invalid values.
- Throws `Error` with a descriptive message listing all failing fields — compatible with any test framework.

## scorecardAssert

- Use `scorecardAssert(ump.scorecard(after, { before }))` for readable transition assertions.
- Methods: `.changed()`, `.notChanged()`, `.cascaded()`, `.fouled()`, `.notFouled()`, `.onlyChanged()`, `.onlyFouled()`, `.check()`.
- `.check()` delegates to `checkAssert(result.check)` for availability assertions on the same scorecard.

## trackCoverage

- Use `trackCoverage(ump)` when tests need to prove they exercised meaningful field states and rule failures.
- Only instrumented `tracker.ump.check()` and `tracker.ump.scorecard()` calls contribute to coverage.
- `report().fieldStates` records enabled/disabled, fair/foul, and satisfied/unsatisfied observations for every field.
- `report().uncoveredRules` relies on core `ump.rules()` plus `challenge()` `ruleId` metadata to distinguish specific rule instances; normalized `index` is still included for lookup.
- `reset()` clears observed field states and covered rule indexes without rebuilding the wrapped umpire.
