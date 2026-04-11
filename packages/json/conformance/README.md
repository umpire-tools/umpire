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
