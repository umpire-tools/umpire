# `@umpire/json` Conformance Fixtures

These fixtures are the first pass of a cross-runtime conformance target for the
portable Umpire JSON contract.

They are intentionally plain JSON so a Kotlin, Dart, Python, or other runtime
can consume the same files without translating TypeScript test code first.

## Goals

- prove that a runtime can parse a portable schema
- prove that `check()`-equivalent evaluation matches the reference behavior
- prove that `fromJson()` / `toJson()` round-trip hydrated schemas exactly
- prove that invalid schemas and missing runtime inputs fail descriptively

The current fixture set is baseball-themed on purpose. The domain is fun, but
the rules are still small enough to read at a glance.

## Fixture Shape

```json
{
  "fixtureVersion": 1,
  "id": "bullpen-structural",
  "description": "Short human summary",
  "schema": {
    "version": 1,
    "fields": {},
    "rules": []
  },
  "cases": [
    {
      "id": "phone-branch-wins-in-the-ninth",
      "values": {},
      "conditions": {},
      "prev": {},
      "expectedAvailability": {}
    }
  ]
}
```

## Fields

- `schema` is a normal `UmpireJsonSchema`
- `values`, `conditions`, and `prev` are runtime inputs for one evaluation case
- `expectedAvailability` is the exact field status map a conforming runtime
  should produce

## Current Coverage

- structural rules
- expression DSL operators, including combinators
- portable validators used as field-bound sources inside other rules
- conditions
- `oneOf()` with `prev`-assisted resolution
- `anyOf()` reason collection
- deep `requires()` cascades
- disabled-source cascades through downstream `disables()`
- `fair: false` cascading into downstream availability failures
- `fairWhen()`
- named validator ops
- `isEmpty` strategies
- schema round-trip, including carried `excluded` metadata
- invalid schema references and runtime condition failures

## Failure Fixture Shape

```json
{
  "fixtureVersion": 1,
  "id": "bad-call-sheet-failures",
  "description": "Short human summary",
  "failures": [
    {
      "id": "unknown-field-in-expression",
      "phase": "validate",
      "schema": {
        "version": 1,
        "fields": {},
        "rules": []
      },
      "errorIncludes": "Unknown field"
    }
  ]
}
```

Failure phases:

- `validate` — the schema itself should be rejected by `validateSchema()`
- `evaluate` — the schema is valid, but runtime evaluation should throw

## Running The Reference Suite

From the repo root:

```bash
yarn turbo run test --filter=@umpire/json -- --runTestsByPath __tests__/conformance.test.ts
```

The TypeScript runner in `__tests__/conformance.test.ts` is the reference
implementation today. Other runtimes should aim to match the fixture outputs,
not necessarily the exact structure of the Jest test.

## Writing A Port Runner

No Node.js or TypeScript tooling required. The fixtures are plain JSON and the
evaluation loop is simple. In pseudocode:

All paths in `index.json` are relative to `index.json` itself (i.e., relative
to the `conformance/` directory). Resolve them against the directory that
contains `index.json`, not the repo root or the working directory of your test
runner.

```
load index.json                              # located at conformance/index.json
base_dir = directory containing index.json  # i.e. conformance/
for each entry in index.fixtures:
    fixture = parse_json(base_dir / entry.path)   # ConformanceFixture shape
    validate that fixture.fixtureVersion == 1

    for each case in fixture.cases:
        result = your_umpire_impl.check(
            schema   = fixture.schema,
            values   = case.values,
            conds    = case.conditions ?? {},
            prev     = case.prev ?? {},
        )
        assert result == case.expectedAvailability, case.id

for each entry in index.failures:
    fixture = parse_json(base_dir / entry.path)   # FailureFixture shape
    for each failure in fixture.failures:
        if failure.phase == "validate":
            assert your_validate_schema(failure.schema) raises error
                   containing failure.errorIncludes
        else:  # "evaluate"
            assert your_umpire_impl.check(failure.schema, ...) raises error
                   containing failure.errorIncludes
```

The `expectedAvailability` map has one entry per field declared in `schema.fields`.
Each entry is:

```
{
  "enabled":  bool,
  "fair":     bool,
  "required": bool,
  "reason":   string | null,   // first blocking reason, null when enabled
  "reasons":  string[],        // all blocking reasons, [] when enabled
  "valid":    bool,            // only present when a validator is attached to this field
  "error":    string           // only present when validation fails (valid is false)
}
```

`valid` appears on any field that has a named validator and is currently enabled
and satisfied. `error` appears only when `valid` is `false` — do not emit
`"error": null` for a field that passes validation. Omit both `valid` and
`error` entirely for fields that have no validator or are currently
disabled/unsatisfied.
