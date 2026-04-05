# @umpire/reads

Derived read tables and read-backed rule bridges for [@umpire/core](https://www.npmjs.com/package/@umpire/core).

[Docs](https://sdougbrown.github.io/umpire/)

## Install

```bash
npm install @umpire/core @umpire/reads
```

## Usage

```ts
import { umpire } from '@umpire/core'
import { createReads, fairWhenRead } from '@umpire/reads'

const reads = createReads<{
  cpu?: string
  motherboard?: string
}, {
  motherboardFair: boolean
}>({
  motherboardFair: ({ input }) => {
    if (!input.motherboard) {
      return true
    }

    return input.motherboard === input.cpu
  },
})

const ump = umpire({
  fields: {
    cpu: {},
    motherboard: {
      isEmpty: (value) => value == null || value === '',
    },
  },
  rules: [
    fairWhenRead('motherboard', 'motherboardFair', reads, {
      reason: 'Selected motherboard no longer matches the CPU socket',
    }),
  ],
})

reads.resolve({ cpu: 'am5', motherboard: 'am5' })
reads.motherboardFair({ cpu: 'am5', motherboard: 'am5' })
reads.inspect({ cpu: 'am5', motherboard: 'am5' })
```

## API

- `createReads(resolvers)` builds a read table with per-key shorthand methods plus `resolve()`, `inspect()`, `from()`, and `trace()`.
- `fairWhenRead(field, key, table, options?)` bridges a boolean read into a `fairWhen` rule.
- `enabledWhenRead(field, key, table, options?)` bridges a boolean read into an `enabledWhen` rule.
- `fromRead(table, key, selectInput?)` returns a predicate helper from a boolean read.
- `ReadInputType.CONDITIONS` evaluates a read against rule conditions instead of field values.

## Behavior Notes

- Reads are memoized per resolution session. If multiple reads depend on the same upstream read, that upstream resolver runs once per `resolve()` or `inspect()` call.
- `inspect()` reports direct dependencies only: accessed input fields in `dependsOnFields`, and explicit `read()` calls in `dependsOnReads`. It does not expand transitive read chains.
- `fairWhenRead()` and `enabledWhenRead()` register bridge metadata on the table instance so `inspect().bridges` and `inspect().graph.edges` can show read-to-field links for that exact instance.
- Identical bridge registrations are deduplicated.

## Docs

https://sdougbrown.github.io/umpire/
