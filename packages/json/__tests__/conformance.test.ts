import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { umpire, type AvailabilityMap, type FieldDef } from '@umpire/core'

import { fromJson, toJson, validateSchema } from '../src/index.js'
import type { UmpireJsonSchema } from '../src/index.js'

type JsonFixtureValue =
  | null
  | string
  | number
  | boolean
  | JsonFixtureValue[]
  | { [key: string]: JsonFixtureValue }

type ExpectedFieldStatus = {
  enabled: boolean
  satisfied: boolean
  fair: boolean
  required: boolean
  reason: string | null
  reasons: string[]
  valid?: boolean
  error?: string
}

type ConformanceCase = {
  id: string
  values: Record<string, JsonFixtureValue>
  conditions?: Record<string, JsonFixtureValue>
  prev?: Record<string, JsonFixtureValue>
  expectedAvailability: Record<string, ExpectedFieldStatus>
}

type ConformanceFixture = {
  fixtureVersion: 1
  id: string
  description?: string
  schema: UmpireJsonSchema
  cases: ConformanceCase[]
}

type FailureCase = {
  id: string
  phase: 'validate' | 'evaluate'
  schema: UmpireJsonSchema
  values?: Record<string, JsonFixtureValue>
  conditions?: Record<string, JsonFixtureValue>
  prev?: Record<string, JsonFixtureValue>
  errorIncludes: string
}

type FailureFixture = {
  fixtureVersion: 1
  id: string
  description?: string
  failures: FailureCase[]
}

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../conformance/fixtures',
)

const failureFixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../conformance/failures',
)

function loadFixtures(): ConformanceFixture[] {
  return readdirSync(fixturesDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) =>
      JSON.parse(readFileSync(path.join(fixturesDir, fileName), 'utf8')) as ConformanceFixture,
    )
}

function loadFailureFixtures(): FailureFixture[] {
  return readdirSync(failureFixturesDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) =>
      JSON.parse(readFileSync(path.join(failureFixturesDir, fileName), 'utf8')) as FailureFixture,
    )
}

function assertFixtureShape(fixture: ConformanceFixture): void {
  expect(fixture.fixtureVersion).toBe(1)
  expect(typeof fixture.id).toBe('string')
  expect(Array.isArray(fixture.cases)).toBe(true)
}

function assertFailureFixtureShape(fixture: FailureFixture): void {
  expect(fixture.fixtureVersion).toBe(1)
  expect(typeof fixture.id).toBe('string')
  expect(Array.isArray(fixture.failures)).toBe(true)
}

describe('JSON conformance fixtures', () => {
  const fixtures = loadFixtures()

  test.each(fixtures)('$id round-trips the schema exactly', ({ schema, ...fixture }) => {
    assertFixtureShape({ schema, ...fixture })
    validateSchema(schema)

    const parsed = fromJson(schema)
    expect(toJson(parsed)).toEqual(schema)
  })

  test.each(fixtures)('$id matches reference availability output', ({ schema, cases, ...fixture }) => {
    assertFixtureShape({ schema, cases, ...fixture })
    validateSchema(schema)

    const parsed = fromJson(schema)
    const runtime = umpire({
      fields: parsed.fields,
      rules: parsed.rules,
      validators: parsed.validators,
    })

    for (const testCase of cases) {
      const actual = runtime.check(
        testCase.values as Record<string, unknown>,
        testCase.conditions as Record<string, unknown> | undefined,
        testCase.prev as Record<string, unknown> | undefined,
      ) as AvailabilityMap<Record<string, FieldDef>>

      expect(actual).toEqual(testCase.expectedAvailability)
    }
  })
})

describe('JSON conformance failure fixtures', () => {
  const fixtures = loadFailureFixtures()

  test.each(fixtures)('$id produces the expected failures', ({ failures, ...fixture }) => {
    assertFailureFixtureShape({ failures, ...fixture })

    for (const failure of failures) {
      if (failure.phase === 'validate') {
        expect(() => validateSchema(failure.schema)).toThrow(failure.errorIncludes)
        continue
      }

      validateSchema(failure.schema)
      const parsed = fromJson(failure.schema)
      const runtime = umpire({
        fields: parsed.fields,
        rules: parsed.rules,
        validators: parsed.validators,
      })

      expect(() =>
        runtime.check(
          (failure.values ?? {}) as Record<string, unknown>,
          failure.conditions as Record<string, unknown> | undefined,
          failure.prev as Record<string, unknown> | undefined,
        ),
      ).toThrow(failure.errorIncludes)
    }
  })
})
