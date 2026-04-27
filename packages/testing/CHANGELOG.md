# @umpire/testing

## 1.0.0

### Minor Changes

- 19fdbfe: Add core rule attribution metadata and testing coverage tracking.

  `@umpire/core` now exposes `ump.rules()` with normalized rule entries and includes `ruleId`/`ruleIndex` on challenge reasons. `@umpire/testing` adds `trackCoverage()` to report observed field states and uncovered rule activations from instrumented `check()` and `scorecard()` calls.

### Patch Changes

- fee01cf: code formatting & type adjustments for better consistency
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

## 0.1.0-alpha.10

### Patch Changes

- Updated dependencies [e570cac]
- Updated dependencies [73cd485]
- Updated dependencies [1fcfe46]
  - @umpire/core@1.0.0

## 0.1.0-alpha.9

### Minor Changes

- Initial release: test utilities for umpire-powered code
- `monkeyTest` — monkey-testing utility for invariant verification
- Generates random field value permutations and asserts rule invariants hold
