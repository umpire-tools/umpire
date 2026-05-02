# @umpire/integration-tests

- Keep tests focused on cross-package compositions shown in docs.
- Prefer full integration flows; avoid re-testing package internals here.
- When adding tests that exercise multiple packages together (e.g. `@umpire/drizzle` + `@umpire/zod` + a real database), put them here — not in the individual package's `__tests__/`. Individual packages test their own internals; this package tests that the seams between packages work.
