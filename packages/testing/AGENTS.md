# @umpire/testing

- Use `monkeyTest(ump, options?)` in tests and assert on the returned `passed` flag or `violations`.
- Configs with 6 or fewer fields are tested exhaustively; larger configs are sampled with a seeded PRNG.
- Pass representative `conditions` snapshots when rules depend on external context.
- Violations are structural invariant failures, not user-facing validation errors.
