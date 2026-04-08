# @umpire/reads

- Use `createReads()` for memoized derived reads, then bridge them into availability with `enabledWhenRead()` or `fairWhenRead()`.
- Use `fromRead()` when you want a read-backed predicate inside hand-written rules.
- Reads are memoized per `resolve()` or `inspect()` session. `inspect()` reports direct field and read dependencies only.
- Use `ReadInputType.CONDITIONS` when a read should consume rule conditions instead of field values.
