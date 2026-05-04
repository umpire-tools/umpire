import { describe, expect, test } from 'bun:test'

import {
  disables,
  defineRule,
  enabledWhen,
  fairWhen,
  oneOf,
  umpire,
  type AvailabilityMap,
  type FieldDef,
} from '@umpire/core'
import * as write from '@umpire/write'
import { checkCreate, checkPatch } from '@umpire/write'
import type {
  WriteCandidate,
  WriteCheckResult,
  WriteIssue,
  WriteIssueKind,
} from '@umpire/write'

type WriteFields = {
  name: FieldDef
  toggle: FieldDef
  dependent: FieldDef
  optional: FieldDef
  guarded: FieldDef
  forbidden: FieldDef
  alpha: FieldDef
  beta: FieldDef
}

type TestValidationSchema = {
  validate(value: unknown): boolean
}

const stringSchema: TestValidationSchema = {
  validate: (value) => typeof value === 'string',
}

function deriveTestSchema<F extends Record<string, FieldDef>>(
  availability: AvailabilityMap<F>,
  schemas: Partial<Record<keyof F & string, TestValidationSchema>>,
) {
  const shape: Record<
    string,
    { required: boolean; schema: TestValidationSchema }
  > = {}

  for (const [field, status] of Object.entries(availability) as Array<
    [keyof F & string, AvailabilityMap<F>[keyof F & string]]
  >) {
    const schema = schemas[field]
    if (!status.enabled || !schema) continue
    shape[field] = { required: status.required, schema }
  }

  return {
    shape,
    safeParse(values: Record<string, unknown>) {
      for (const [field, entry] of Object.entries(shape)) {
        if (!(field in values)) {
          if (entry.required) return { success: false }
          continue
        }

        if (!entry.schema.validate(values[field])) {
          return { success: false }
        }
      }

      return { success: true }
    },
  }
}

describe('checkCreate', () => {
  test('passes with no issues', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: { required: true } },
      rules: [],
    })

    const result = checkCreate(ump, { name: 'Douglas' })

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.fouls).toEqual([])
    expect(result.errors).toEqual([])
    expect(result.candidate).toEqual({ name: 'Douglas' })
  })

  test('fails on a missing enabled required field', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: { required: true } },
      rules: [],
    })

    const result = checkCreate(ump, {})

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      { kind: 'required', field: 'name', message: 'name is required' },
    ])
    expect(result.fouls).toEqual([])
    expect(result.errors).toEqual(['name is required'])
    expect(result.candidate).toEqual({})
  })

  test('fails on a satisfied disabled field', () => {
    const ump = umpire<Pick<WriteFields, 'toggle' | 'dependent'>>({
      fields: { toggle: { default: false }, dependent: {} },
      rules: [enabledWhen('dependent', (values) => values.toggle === true)],
    })

    const result = checkCreate(ump, { dependent: 'submitted anyway' })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      { kind: 'disabled', field: 'dependent', message: 'condition not met' },
    ])
    expect(result.fouls).toEqual([])
    expect(result.errors).toEqual(['condition not met'])
    expect(result.candidate).toEqual({
      toggle: false,
      dependent: 'submitted anyway',
    })
  })

  test('fails on a foul field', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: {} },
      rules: [fairWhen('name', (value) => value !== 'reserved')],
    })

    const result = checkCreate(ump, { name: 'reserved' })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      {
        kind: 'foul',
        field: 'name',
        message: 'selection is no longer valid',
      },
    ])
    expect(result.fouls).toEqual([])
    expect(result.errors).toEqual(['selection is no longer valid'])
    expect(result.candidate).toEqual({ name: 'reserved' })
  })

  test('returns a candidate with Umpire defaults applied', () => {
    const ump = umpire<Pick<WriteFields, 'toggle' | 'dependent'>>({
      fields: {
        toggle: { default: false },
        dependent: { default: 'defaulted', required: true },
      },
      rules: [],
    })

    const omittedResult = checkCreate(ump, { toggle: true })
    const result = checkCreate(ump, { toggle: true, dependent: 'submitted' })

    expect(omittedResult.candidate).toEqual({
      toggle: true,
      dependent: 'defaulted',
    })
    expect(omittedResult.issues).toEqual([])
    expect(result.candidate.toggle).toBe(true)
    expect(result.candidate.dependent).toBe('submitted')
    expect(result.candidate).toEqual({ toggle: true, dependent: 'submitted' })
  })

  test('treats explicit undefined on create as an assigned value', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: { required: true } },
      rules: [],
    })

    const result = checkCreate(ump, { name: undefined })

    expect(Object.hasOwn(result.candidate, 'name')).toBe(true)
    expect(result.candidate.name).toBeUndefined()
    expect(result.issues).toEqual([
      { kind: 'required', field: 'name', message: 'name is required' },
    ])
  })

  test('accepts context when checking create availability', () => {
    const ump = umpire<Pick<WriteFields, 'guarded'>, { allow: boolean }>({
      fields: { guarded: {} },
      rules: [enabledWhen('guarded', (_values, context) => context.allow)],
    })

    expect(
      checkCreate(ump, { guarded: 'value' }, { allow: true }).issues,
    ).toEqual([])
    expect(
      checkCreate(ump, { guarded: 'value' }, { allow: false }).issues,
    ).toEqual([
      { kind: 'disabled', field: 'guarded', message: 'condition not met' },
    ])
  })
})

describe('checkPatch', () => {
  test('emits fouls when a transition creates stale values', () => {
    const ump = umpire<Pick<WriteFields, 'toggle' | 'dependent'>>({
      fields: { toggle: {}, dependent: {} },
      rules: [enabledWhen('dependent', (values) => values.toggle === true)],
    })

    const result = checkPatch(
      ump,
      { toggle: true, dependent: 'keep me' },
      { toggle: false },
    )

    expect(result.ok).toBe(false)
    expect(result.fouls).toEqual([
      {
        field: 'dependent',
        reason: 'condition not met',
        suggestedValue: undefined,
      },
    ])
    expect(result.issues).toEqual([
      { kind: 'disabled', field: 'dependent', message: 'condition not met' },
    ])
    expect(result.errors).toEqual(['condition not met'])
  })

  test('passes prev through to ump.check semantics', () => {
    const ump = umpire<Pick<WriteFields, 'alpha' | 'beta'>>({
      fields: { alpha: {}, beta: {} },
      rules: [oneOf('strategy', { first: ['alpha'], second: ['beta'] })],
    })

    const result = checkPatch(
      ump,
      { alpha: 'still here' },
      { beta: 'new value' },
    )
    const directResult = ump.check(result.candidate)

    expect(result.availability.alpha.enabled).toBe(false)
    expect(result.availability.beta.enabled).toBe(true)
    expect(directResult.alpha.enabled).toBe(true)
    expect(directResult.beta.enabled).toBe(false)
    expect(result.availability).not.toEqual(directResult)
    expect(result.issues).toEqual([
      {
        kind: 'disabled',
        field: 'alpha',
        message: 'conflicts with second strategy',
      },
    ])
  })

  test('keeps transition foul reasons out of errors', () => {
    const ump = umpire<Pick<WriteFields, 'name' | 'toggle' | 'dependent'>>({
      fields: { name: { required: true }, toggle: {}, dependent: {} },
      rules: [
        enabledWhen('dependent', (values) => values.toggle === true, {
          reason: 'dependent disabled',
        }),
      ],
    })

    const result = checkPatch(
      ump,
      { toggle: true, dependent: 'kept' },
      { toggle: false },
    )

    expect(result.issues).toEqual([
      { kind: 'required', field: 'name', message: 'name is required' },
      { kind: 'disabled', field: 'dependent', message: 'dependent disabled' },
    ])
    expect(result.fouls).toEqual([
      {
        field: 'dependent',
        reason: 'dependent disabled',
        suggestedValue: undefined,
      },
    ])
    expect(result.errors).toEqual(['name is required', 'dependent disabled'])
  })

  test('respects shallow merge semantics', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: {} },
      rules: [],
    })
    const existing = { name: { first: 'Douglas', last: 'Brown' } }

    const result = checkPatch(ump, existing, { name: { first: 'Doug' } })

    expect(result.candidate).toEqual({ name: { first: 'Doug' } })
  })

  test('keeps unknown patch keys on the candidate while ignoring them in policy checks', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: {} },
      rules: [enabledWhen('name', (values) => values.name !== 'blocked')],
    })

    const result = checkPatch(
      ump,
      { name: 'Douglas', existingOnly: 'kept' },
      { name: 'Doug', patchOnly: 'kept too' },
    )

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    expect(Object.keys(result.availability)).toEqual(['name'])
    expect(result.candidate).toEqual({
      name: 'Doug',
      existingOnly: 'kept',
      patchOnly: 'kept too',
    })
  })

  test('returns the merged candidate', () => {
    const ump = umpire<Pick<WriteFields, 'name' | 'optional'>>({
      fields: { name: { default: 'default name' }, optional: {} },
      rules: [],
    })

    const result = checkPatch(ump, { name: 'Douglas' }, { optional: 'notes' })

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.fouls).toEqual([])
    expect(result.errors).toEqual([])
    expect(result.candidate).toEqual({ name: 'Douglas', optional: 'notes' })
  })

  test('treats explicit undefined as a real assigned value', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: { required: true } },
      rules: [],
    })

    const result = checkPatch(ump, { name: 'Douglas' }, { name: undefined })

    expect(Object.hasOwn(result.candidate, 'name')).toBe(true)
    expect(result.candidate.name).toBeUndefined()
    expect(result.issues).toEqual([
      { kind: 'required', field: 'name', message: 'name is required' },
    ])
  })
})

describe('issue derivation', () => {
  test('ignores unknown keys outside the Umpire field set', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: {} },
      rules: [],
    })

    const result = checkCreate(ump, { name: 'Douglas', extra: 'kept' })

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  test('preserves unknown keys on the candidate', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: {} },
      rules: [],
    })

    const result = checkCreate(ump, { name: 'Douglas', extra: 'kept' })

    expect(result.candidate).toEqual({ name: 'Douglas', extra: 'kept' })
  })

  test('does not issue optional empty fields', () => {
    const ump = umpire<Pick<WriteFields, 'optional'>>({
      fields: {
        optional: { isEmpty: (value) => value === '' || value == null },
      },
      rules: [],
    })

    const result = checkCreate(ump, { optional: '' })

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  test('uses required fallback messages', () => {
    const requiredUmp = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: { required: true } },
      rules: [],
    })

    expect(checkCreate(requiredUmp, {}).issues).toEqual([
      { kind: 'required', field: 'name', message: 'name is required' },
    ])
  })

  test('uses disabled precedence', () => {
    const disabledUmp = umpire<Pick<WriteFields, 'toggle' | 'dependent'>>({
      fields: { toggle: { default: false }, dependent: { required: true } },
      rules: [
        enabledWhen('dependent', () => false, { reason: 'disabled reason' }),
      ],
    })

    expect(checkCreate(disabledUmp, { dependent: 'value' }).issues).toEqual([
      { kind: 'disabled', field: 'dependent', message: 'disabled reason' },
    ])
  })

  test('uses foul precedence', () => {
    const foulUmp = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: { required: true } },
      rules: [fairWhen('name', () => false, { reason: 'foul reason' })],
    })

    expect(checkCreate(foulUmp, { name: 'value' }).issues).toEqual([
      { kind: 'foul', field: 'name', message: 'foul reason' },
    ])
  })

  test('uses explicit reason', () => {
    const reasonUmp = umpire<Pick<WriteFields, 'dependent'>>({
      fields: { dependent: {} },
      rules: [enabledWhen('dependent', () => false, { reason: 'from reason' })],
    })

    expect(checkCreate(reasonUmp, { dependent: 'value' }).issues).toEqual([
      { kind: 'disabled', field: 'dependent', message: 'from reason' },
    ])
  })

  test('uses reasons[0] when reason is null', () => {
    const nullReasonUmp = umpire<Pick<WriteFields, 'guarded'>>({
      fields: { guarded: {} },
      rules: [
        defineRule({
          type: 'contextualGate',
          targets: ['guarded'],
          sources: [],
          constraint: 'enabled',
          evaluate() {
            return new Map([
              [
                'guarded',
                {
                  enabled: false,
                  reason: null,
                  reasons: ['derived reason'],
                },
              ],
            ])
          },
        }),
      ],
    })
    const nullReasonResult = checkCreate(nullReasonUmp, { guarded: 'value' })

    expect(nullReasonResult.availability.guarded.reason).toBeNull()
    expect(nullReasonResult.availability.guarded.reasons[0]).toBe(
      'derived reason',
    )
    expect(nullReasonResult.issues).toEqual([
      { kind: 'disabled', field: 'guarded', message: 'derived reason' },
    ])
  })

  test('uses status reasons[0] for a disables rule', () => {
    const reasonsUmp = umpire<Pick<WriteFields, 'name' | 'guarded'>>({
      fields: { name: {}, guarded: {} },
      rules: [disables('name', ['guarded'])],
    })

    expect(
      checkCreate(reasonsUmp, { name: 'set', guarded: 'value' }).issues,
    ).toEqual([
      { kind: 'disabled', field: 'guarded', message: 'overridden by name' },
    ])
  })

  test('falls back for disabled issues with empty reason metadata', () => {
    const ump = umpire<Pick<WriteFields, 'guarded'>>({
      fields: { guarded: {} },
      rules: [
        defineRule({
          type: 'contextualGate',
          targets: ['guarded'],
          sources: [],
          constraint: 'enabled',
          evaluate() {
            return new Map([
              ['guarded', { enabled: false, reason: undefined, reasons: [] }],
            ])
          },
        }),
      ],
    })

    expect(checkCreate(ump, { guarded: 'value' }).issues).toEqual([
      { kind: 'disabled', field: 'guarded', message: 'guarded is disabled' },
    ])
  })

  test('falls back for foul issues with empty reason metadata', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: {} },
      rules: [
        defineRule({
          type: 'contextualGate',
          targets: ['name'],
          sources: [],
          constraint: 'fair',
          evaluate() {
            return new Map([
              ['name', { fair: false, reason: undefined, reasons: [] }],
            ])
          },
        }),
      ],
    })

    expect(checkCreate(ump, { name: 'value' }).issues).toEqual([
      { kind: 'foul', field: 'name', message: 'name is foul' },
    ])
  })

  test('accumulates multiple simultaneous issues', () => {
    const ump = umpire<Pick<WriteFields, 'name' | 'optional'>>({
      fields: { name: { required: true }, optional: { required: true } },
      rules: [],
    })

    const result = checkCreate(ump, {})

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      { kind: 'required', field: 'name', message: 'name is required' },
      { kind: 'required', field: 'optional', message: 'optional is required' },
    ])
    expect(result.errors).toEqual(['name is required', 'optional is required'])
  })

  test('does not issue disabled unsatisfied required fields', () => {
    const ump = umpire<Pick<WriteFields, 'dependent'>>({
      fields: { dependent: { required: true } },
      rules: [
        enabledWhen('dependent', () => false, { reason: 'currently disabled' }),
      ],
    })

    const result = checkCreate(ump, {})

    expect(result.ok).toBe(true)
    expect(result.availability.dependent.enabled).toBe(false)
    expect(result.availability.dependent.required).toBe(false)
    expect(result.availability.dependent.satisfied).toBe(false)
    expect(result.issues).toEqual([])
    expect(result.errors).toEqual([])
  })

  test('does not issue fouls for unsatisfied fields', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: { required: true } },
      rules: [
        defineRule({
          type: 'contextualGate',
          targets: ['name'],
          sources: [],
          constraint: 'fair',
          evaluate() {
            return new Map([['name', { fair: false, reason: 'reserved' }]])
          },
        }),
      ],
    })

    const result = checkCreate(ump, {})

    expect(result.availability.name.enabled).toBe(true)
    expect(result.availability.name.satisfied).toBe(false)
    expect(result.availability.name.fair).toBe(false)
    expect(result.issues).toEqual([
      { kind: 'required', field: 'name', message: 'reserved' },
    ])
    expect(result.errors).toEqual(['reserved'])
  })

  test('uses context on patch and keeps transition fouls separate from current-state issues', () => {
    const ump = umpire<
      Pick<WriteFields, 'toggle' | 'dependent'>,
      { allow: boolean }
    >({
      fields: { toggle: {}, dependent: {} },
      rules: [enabledWhen('dependent', (_values, context) => context.allow)],
    })

    const result = checkPatch(
      ump,
      { toggle: true, dependent: 'keep me' },
      { toggle: false },
      { allow: false },
    )

    expect(result.issues).toEqual([
      { kind: 'disabled', field: 'dependent', message: 'condition not met' },
    ])
    expect(result.fouls).toEqual([])
    expect(result.ok).toBe(false)
  })

  test('uses context when evaluating patch transition fouls', () => {
    const ump = umpire<
      Pick<WriteFields, 'toggle' | 'dependent'>,
      { allow: boolean }
    >({
      fields: { toggle: {}, dependent: {} },
      rules: [
        enabledWhen('dependent', (values, context) => {
          return values.toggle === true || context.allow
        }),
      ],
    })

    const blocked = checkPatch(
      ump,
      { toggle: true, dependent: 'keep me' },
      { toggle: false },
      { allow: false },
    )
    const allowed = checkPatch(
      ump,
      { toggle: true, dependent: 'keep me' },
      { toggle: false },
      { allow: true },
    )

    expect(blocked.fouls).toEqual([
      {
        field: 'dependent',
        reason: 'condition not met',
        suggestedValue: undefined,
      },
    ])
    expect(allowed.fouls).toEqual([])
    expect(allowed.issues).toEqual([])
    expect(allowed.ok).toBe(true)
  })

  test('fails enabled required unsatisfied fields even when a UI would block submission', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: { required: true } },
      rules: [],
    })

    const result = checkCreate(ump, {})

    expect(result.ok).toBe(false)
    expect(result.issues[0]).toEqual({
      kind: 'required',
      field: 'name',
      message: 'name is required',
    })
  })

  test('fails satisfied disabled values submitted by non-UI clients', () => {
    const ump = umpire<Pick<WriteFields, 'forbidden'>>({
      fields: { forbidden: {} },
      rules: [
        enabledWhen('forbidden', () => false, { reason: 'server says no' }),
      ],
    })

    const result = checkCreate(ump, { forbidden: 'curl payload' })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      { kind: 'disabled', field: 'forbidden', message: 'server says no' },
    ])
  })

  test('keeps already-disabled stale values untouched on a no-op patch', () => {
    const ump = umpire<Pick<WriteFields, 'toggle' | 'dependent'>>({
      fields: { toggle: { default: false }, dependent: {} },
      rules: [enabledWhen('dependent', (values) => values.toggle === true)],
    })

    const result = checkPatch(ump, { toggle: false, dependent: 'stale' }, {})

    expect(result.candidate).toEqual({ toggle: false, dependent: 'stale' })
    expect(result.issues).toEqual([
      { kind: 'disabled', field: 'dependent', message: 'condition not met' },
    ])
    expect(result.fouls).toEqual([])
    expect(result.ok).toBe(false)
  })
})

describe('validation schema composition', () => {
  test('checkCreate output composes with availability-aware validation schemas', () => {
    const ump = umpire<Pick<WriteFields, 'name' | 'dependent' | 'toggle'>>({
      fields: {
        name: { required: true },
        toggle: { default: false },
        dependent: {},
      },
      rules: [enabledWhen('dependent', (values) => values.toggle === true)],
    })
    const result = checkCreate(ump, { name: 'Douglas' })
    const schema = deriveTestSchema(result.availability, {
      name: stringSchema,
      dependent: stringSchema,
    })

    expect(schema.safeParse(result.candidate).success).toBe(true)
    expect(Object.keys(schema.shape)).toEqual(['name'])
  })

  test('checkPatch output composes with availability-aware validation schemas', () => {
    const ump = umpire<Pick<WriteFields, 'name' | 'optional'>>({
      fields: { name: { required: true }, optional: {} },
      rules: [],
    })
    const result = checkPatch(ump, { name: 'Douglas' }, { optional: 'notes' })
    const schema = deriveTestSchema(result.availability, {
      name: stringSchema,
      optional: stringSchema,
    })

    expect(schema.safeParse(result.candidate).success).toBe(true)
    expect(schema.safeParse({ optional: 'notes' }).success).toBe(false)
  })

  test('enabled required unsatisfied fields remain present and required in the derived schema', () => {
    const ump = umpire<Pick<WriteFields, 'name'>>({
      fields: { name: { required: true } },
      rules: [],
    })
    const result = checkCreate(ump, {})
    const schema = deriveTestSchema(result.availability, { name: stringSchema })

    expect(Object.keys(schema.shape)).toEqual(['name'])
    expect(schema.safeParse({}).success).toBe(false)
  })

  test('disabled fields are omitted while submitted disabled values are reported by write', () => {
    const ump = umpire<Pick<WriteFields, 'toggle' | 'dependent'>>({
      fields: { toggle: { default: false }, dependent: {} },
      rules: [enabledWhen('dependent', (values) => values.toggle === true)],
    })
    const result = checkCreate(ump, { dependent: 'submitted anyway' })
    const schema = deriveTestSchema(result.availability, {
      dependent: stringSchema,
    })

    expect(result.issues).toEqual([
      { kind: 'disabled', field: 'dependent', message: 'condition not met' },
    ])
    expect(Object.keys(schema.shape)).toEqual([])
    expect(schema.safeParse({}).success).toBe(true)
  })
})

describe('exports', () => {
  test('exports public result and issue types', () => {
    const buildResult = () =>
      checkCreate(
        umpire<Pick<WriteFields, 'name'>>({
          fields: { name: { required: true } },
          rules: [],
        }),
        {},
      )

    const result: WriteCheckResult<Pick<WriteFields, 'name'>> = buildResult()
    const candidate: WriteCandidate<Pick<WriteFields, 'name'>> =
      result.candidate
    const issue: WriteIssue<Pick<WriteFields, 'name'>> | undefined =
      result.issues[0]
    const kind: WriteIssueKind = issue?.kind ?? 'required'

    expect(candidate).toEqual({})
    expect(issue).toEqual({
      kind: 'required',
      field: 'name',
      message: 'name is required',
    })
    expect(kind).toBe('required')
  })

  test('exports runtime checking and validation composition helpers', () => {
    expect(Object.keys(write).sort()).toEqual([
      'checkCreate',
      'checkPatch',
      'composeWriteResult',
      'flattenFieldErrorPath',
      'flattenFieldErrorPaths',
      'joinFieldPath',
      'nestNamespacedValues',
      'runWriteValidationAdapter',
      'splitNamespacedField',
    ])
    expect(typeof write.checkCreate).toBe('function')
    expect(typeof write.checkPatch).toBe('function')
    expect(typeof write.composeWriteResult).toBe('function')
    expect(typeof write.nestNamespacedValues).toBe('function')
    expect(typeof write.runWriteValidationAdapter).toBe('function')
  })
})
