# @umpire/reads

Derived read tables and read-backed rule bridges for [@umpire/core](https://www.npmjs.com/package/@umpire/core).

[Docs](https://umpire.tools/)

## Install

```bash
npm install @umpire/core @umpire/reads
```

## The problem it solves

A plain `fairWhen` predicate works, but it's anonymous — `challenge()` sees that a rule fired, not what domain concept drove it. It's also local: render logic that needs the same derived value has to reimplement the same lookup independently. `@umpire/reads` solves both by naming the derivation once and making it available to rules, inspection, and any other consumer without recomputation.

## Usage

```ts
import { umpire } from '@umpire/core'
import { createReads, fairWhenRead } from '@umpire/reads'

const reads = createReads<
  {
    cpu?: string
    motherboard?: string
  },
  {
    selectedCpu: { socket: string } | undefined
    motherboardFair: boolean
  }
>({
  selectedCpu: ({ input }) =>
    input.cpu === 'am5' ? { socket: 'am5' } : undefined,
  motherboardFair: ({ input, read }) => {
    const cpu = read('selectedCpu')
    if (!input.motherboard || !cpu) {
      return true
    }

    return input.motherboard === cpu.socket
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

`motherboardFair` calls `read('selectedCpu')` rather than repeating the lookup. Both reads are evaluated at most once per `resolve()` or `inspect()` call, regardless of how many rules or other reads depend on them.

## API

- `createReads(resolvers)` builds a read table from named resolver functions. Returns the table with per-key shorthand methods, plus `resolve()`, `inspect()`, `from()`, and `trace()`. Use this as the foundation for all read-backed rules.
- `fairWhenRead(field, key, table, options?)` generates a `fairWhen` rule backed by a boolean read and registers the connection on the table so it appears in `inspect()` and `challenge()` traces. Reach for this when a fairness check depends on a derived value you want named and shared.
- `enabledWhenRead(field, key, table, options?)` does the same for availability: generates an `enabledWhen` rule backed by a boolean read. Use it when the condition for enabling a field involves derived or catalog-driven data.
- `fromRead(table, key, selectInput?)` extracts a read as a plain predicate function rather than generating a rule automatically. Useful when you need the read-backed value inside a hand-written rule or a conditional you're composing yourself.
- `ReadInputType.CONDITIONS` is passed as `inputType` in options to `fairWhenRead` or `enabledWhenRead` when the read should receive rule conditions as its input instead of field values. Use it for reads that evaluate metadata about the form context rather than the user's current values.

## Behavior Notes

- Reads are memoized per resolution session. If multiple reads depend on the same upstream read, that upstream resolver runs once per `resolve()` or `inspect()` call.
- `inspect()` reports direct dependencies only: accessed input fields in `dependsOnFields`, and explicit `read()` calls in `dependsOnReads`. It does not expand transitive read chains.
- `fairWhenRead()` and `enabledWhenRead()` register bridge metadata on the table instance so `inspect().bridges` and `inspect().graph.edges` can show read-to-field links for that exact instance.
- Identical bridge registrations are deduplicated.

## Docs

https://umpire.tools/
