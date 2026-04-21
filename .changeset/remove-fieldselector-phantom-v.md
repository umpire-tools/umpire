---
"@umpire/core": minor
---

Remove unused `V` type parameter from `FieldSelector<F>` and the function signatures that accepted it (`enabledWhen`, `requires`, `disables`). The parameter was never referenced in the type body and had no effect on type checking. `fairWhen` retains its `V` parameter for use with `FairPredicate<V, F, C>`.
