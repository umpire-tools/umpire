import type { RuleInspection, RuleOperandInspection } from '@umpire/core'
import type { AnyRuleEntry } from '../src/types.js'
import {
  describeEntry,
  describeInspection,
  describeOperand,
} from '../src/panel/format.js'

describe('format helpers', () => {
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
