# @umpire/write

- Use this package for write-policy helpers that coordinate Umpire state updates.
- Keep helpers thin and composable; prefer adapters around `@umpire/core` over new state machinery.
- Do not imply persistence, validation, or database safety guarantees here.
- Write owns generic validation composition: `composeWriteResult`, `runWriteValidationAdapter`, and the `WriteValidationAdapter` protocol type. Adapters from `@umpire/zod` and `@umpire/effect` satisfy `WriteValidationAdapter` out of the box.

## Issue Detection Logic

`checkCreate` and `checkPatch` convert availability into issues using exactly three conditions:

| Condition                           | Issue kind |
| ----------------------------------- | ---------- |
| `enabled && required && !satisfied` | `required` |
| `satisfied && !enabled`             | `disabled` |
| `satisfied && enabled && !fair`     | `foul`     |

A field that is **enabled, unsatisfied, and not required** produces **no issue**. This is by design — optional fields can be left empty. To block a write on a missing field, the FieldDef must have `required: true` (in `@umpire/drizzle` this comes from Drizzle's `notNull()` without a default).
