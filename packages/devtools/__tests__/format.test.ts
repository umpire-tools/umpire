import type { ChallengeTraceAttachment, RuleInspection } from '@umpire/core'
import type { AnyRuleEntry } from '../src/types.js'
import {
  describeEntry,
  describeInspection,
  describeOperand,
  formatTimestamp,
  formatValue,
  getReasonMeta,
  getTraceMeta,
} from '../src/panel/format.js'

describe('format helpers', () => {
  it('formats primitive values', () => {
    expect(formatValue(undefined)).toBe('undefined')
    expect(formatValue(null)).toBe('null')
    expect(formatValue(42)).toBe('42')
    expect(formatValue(true)).toBe('true')
    expect(formatValue('short')).toBe('short')
    expect(formatValue('abcdef', 4)).toBe('abc…')
  })

  it('formats arrays', () => {
    expect(formatValue([1, 'two', false])).toBe('[1, two, false]')
    expect(formatValue([['nested'], 'value'], 10)).toBe('[[nested]…')
    expect(formatValue(['x'.repeat(60)], 20)).toBe('[xxxxxxxxxxxxxxxxxx…')
  })

  it('formats serializable objects', () => {
    expect(formatValue({ a: 1, b: true })).toBe('{"a":1,"b":true}')
  })

  it('truncates long json objects deterministically', () => {
    expect(formatValue({ a: 'x'.repeat(60) }, 20)).toBe('{"a":"xxxxxxxxxxxxx…')
  })

  it('falls back to String when json serialization yields no value', () => {
    const fn = () => undefined

    expect(formatValue(fn)).toBe(String(fn))
    expect(formatValue(Symbol('fallback'))).toBe(String(Symbol('fallback')))
  })

  it('falls back to String for circular values', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(formatValue(circular)).toBe('[object Object]')
  })

  it('formats timestamps with a stable time shape', () => {
    const toLocaleTimeString = vi
      .spyOn(Date.prototype, 'toLocaleTimeString')
      .mockImplementation(function (locales, options) {
        expect(locales).toEqual([])
        expect(options).toEqual({
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })

        return `mocked-${this.getTime()}`
      })

    const morning = Date.UTC(2024, 0, 1, 13, 5, 9)
    const evening = Date.UTC(2024, 0, 1, 23, 45, 1)

    try {
      expect(formatTimestamp(morning)).toBe(`mocked-${morning}`)
      expect(formatTimestamp(evening)).toBe(`mocked-${evening}`)
      expect(morning).not.toBe(evening)
    } finally {
      toLocaleTimeString.mockRestore()
    }
  })

  it('filters reason metadata fields', () => {
    expect(
      getReasonMeta({
        inner: [{ rule: 'ignored', reason: 'ignored' }],
        passed: true,
        reason: 'ignored',
        rule: 'ignored',
        ruleId: 'ignored',
        ruleIndex: 3,
        trace: [{ id: 'ignored' }],
        undefinedValue: undefined,
        nullValue: null,
        stringValue: 'ok',
        numberValue: 7,
        booleanValue: false,
        arrayValue: ['ok'],
        objectValue: { nested: true },
      }),
    ).toEqual([
      ['nullValue', null],
      ['stringValue', 'ok'],
      ['numberValue', 7],
      ['booleanValue', false],
      ['arrayValue', ['ok']],
    ])
  })

  it('filters trace metadata fields', () => {
    const trace: ChallengeTraceAttachment = {
      dependencies: ['ignored'],
      id: 'ignored',
      kind: 'ignored',
      undefinedValue: undefined,
      nullValue: null,
      stringValue: 'ok',
      numberValue: 7,
      booleanValue: true,
      arrayValue: ['ok'],
      objectValue: { nested: true },
    }

    expect(getTraceMeta(trace)).toEqual([
      ['nullValue', null],
      ['stringValue', 'ok'],
      ['numberValue', 7],
      ['booleanValue', true],
      ['arrayValue', ['ok']],
    ])
  })

  it('matches the operand matrix', () => {
    expect(describeOperand({ kind: 'field', field: 'email' })).toBe('email')
    expect(describeOperand({ kind: 'predicate', predicate: undefined })).toBe(
      'predicate',
    )
    expect(
      describeOperand({ kind: 'predicate', predicate: { field: 'email' } }),
    ).toBe('email?')
    expect(
      describeOperand({
        kind: 'predicate',
        predicate: { namedCheck: { __check: 'minLength' } },
      }),
    ).toBe('minLength')
    expect(
      describeOperand({
        kind: 'predicate',
        predicate: {
          field: 'email',
          namedCheck: { __check: 'minLength' },
        },
      }),
    ).toBe('email?.minLength')
  })

  it('matches the inspection matrix', () => {
    const requires: RuleInspection<
      Record<string, { required?: boolean }>,
      Record<string, unknown>
    > = {
      kind: 'requires',
      target: 'submit',
      dependencies: [
        { kind: 'field', field: 'email' },
        { kind: 'predicate', predicate: { field: 'terms' } },
      ],
      reason: undefined,
      hasDynamicReason: false,
    }

    const anyOf: RuleInspection<
      Record<string, { required?: boolean }>,
      Record<string, unknown>
    > = {
      kind: 'anyOf',
      rules: [requires, requires, requires],
      reason: undefined,
      hasDynamicReason: false,
    }

    const sync: RuleInspection<
      Record<string, { required?: boolean }>,
      Record<string, unknown>
    > = {
      kind: 'custom',
      type: 'sync',
      targets: ['a', 'b'],
      reason: undefined,
      hasDynamicReason: false,
    }

    expect(describeInspection({ kind: 'enabledWhen', target: 'submit' })).toBe(
      'enabledWhen(submit)',
    )
    expect(
      describeInspection({
        kind: 'disables',
        source: { kind: 'field', field: 'sso' },
        targets: ['email'],
        reason: undefined,
        hasDynamicReason: false,
      }),
    ).toBe('disables(sso, [email])')
    expect(
      describeInspection({
        kind: 'disables',
        source: { kind: 'predicate', predicate: { field: 'domain' } },
        targets: ['sso'],
        reason: undefined,
        hasDynamicReason: false,
      }),
    ).toBe('disables(domain?, [sso])')
    expect(describeInspection({ kind: 'fairWhen', target: 'submit' })).toBe(
      'fairWhen(submit)',
    )
    expect(describeInspection(requires)).toBe('requires(submit, email, terms?)')
    expect(
      describeInspection({
        kind: 'oneOf',
        groupName: 'authMethod',
        reason: undefined,
        hasDynamicReason: false,
      }),
    ).toBe('oneOf(authMethod)')
    expect(describeInspection(anyOf)).toBe('anyOf(3 rules)')
    expect(
      describeInspection({
        kind: 'eitherOf',
        groupName: 'submitAuth',
        reason: undefined,
        hasDynamicReason: false,
      }),
    ).toBe('eitherOf(submitAuth)')
    expect(describeInspection(sync)).toBe('sync(a, b)')
  })

  it('describes inspectable and uninspectable entries', () => {
    const entry: AnyRuleEntry = {
      index: 7,
      id: 'rule-7',
      inspection: {
        kind: 'requires',
        target: 'submit',
        dependencies: [
          { kind: 'field', field: 'email' },
          { kind: 'predicate', predicate: { field: 'terms' } },
        ],
        reason: undefined,
        hasDynamicReason: false,
      },
    }

    expect(describeEntry(entry)).toBe('requires(submit, email, terms?)')
    expect(
      describeEntry({ index: 0, id: 'rule-0', inspection: undefined }),
    ).toBe('uninspectable rule #0')
  })
})
