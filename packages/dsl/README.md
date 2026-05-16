# @umpire/dsl

Pure expression DSL and compiler helpers for Umpire.

## When to use this vs `@umpire/json`

Reach for `@umpire/dsl` when your rules live entirely in TypeScript — no serialization, no JSON schemas, no round-tripping across runtimes. If you need `expr.check()` or rules that survive a JSON boundary, use `@umpire/json` instead. Its `expr` is a superset and covers everything here.

## Example

A scheduler form where `endDate` is only available once the user has set a `startDate` and chosen a recurrence mode other than `'none'`:

```ts
import { expr, compileExpr } from '@umpire/dsl'
import { umpire, enabledWhen } from '@umpire/core'

const endDateEnabled = compileExpr(
  expr.and(expr.present('startDate'), expr.neq('recurrence', 'none')),
  { fieldNames: new Set(['startDate', 'recurrence']) },
)

const ump = umpire({
  fields: {
    startDate: {},
    recurrence: {},
    endDate: {},
    timezone: {},
  },
  rules: [enabledWhen('endDate', endDateEnabled)],
})

ump.check({
  startDate: '2026-06-01',
  recurrence: 'weekly',
  endDate: null,
  timezone: 'UTC',
})
// endDate: { enabled: true, required: false, satisfied: false }

ump.check({
  startDate: null,
  recurrence: 'none',
  endDate: null,
  timezone: 'UTC',
})
// endDate: { enabled: false, required: false, satisfied: false }
```

## API

| Export                             | What it is                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `expr`                             | Expression builder — `expr.present()`, `expr.neq()`, `expr.and()`, and the rest                                              |
| `compileExpr(expression, options)` | Turns an `Expr` into a `(values, conditions) => boolean` predicate; validates field and condition references at compile time |
| `getExprFieldRefs(expression)`     | Returns the unique field names referenced by an expression                                                                   |
| `Expr`                             | Union type of all expression AST nodes                                                                                       |
| `ExprBuilder<F, C>`                | Typed shape of `expr`, parameterized over field names and condition keys                                                     |

For the full `expr.*` method table, see the [docs page](https://umpire.tools/extensions/dsl/).
