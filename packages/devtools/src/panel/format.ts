import type {
  ChallengeTraceAttachment,
  RuleInspection,
  RuleOperandInspection,
} from '@umpire/core'
import type { AnyRuleEntry } from '../types.js'

export type ReasonLike = {
  inner?: ReasonLike[]
  passed?: boolean
  reason: string | null
  rule: string
  trace?: ChallengeTraceAttachment[]
  [key: string]: unknown
}

const skippedReasonKeys = new Set([
  'inner',
  'passed',
  'reason',
  'ruleId',
  'ruleIndex',
  'rule',
  'trace',
])

export function formatValue(value: unknown, maxLength = 44): string {
  if (value === undefined) {
    return 'undefined'
  }

  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return value.length > maxLength
      ? `${value.slice(0, maxLength - 1)}…`
      : value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    const compact = `[${value.map((entry) => formatValue(entry, 20)).join(', ')}]`

    return compact.length > maxLength
      ? `${compact.slice(0, maxLength - 1)}…`
      : compact
  }

  try {
    const compact = JSON.stringify(value)

    if (!compact) {
      return String(value)
    }

    return compact.length > maxLength
      ? `${compact.slice(0, maxLength - 1)}…`
      : compact
  } catch {
    return String(value)
  }
}

export function formatTimestamp(value: number) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function getReasonMeta(reason: ReasonLike) {
  return Object.entries(reason).filter(
    ([key, value]) =>
      !skippedReasonKeys.has(key) &&
      value !== undefined &&
      (typeof value !== 'object' || value === null || Array.isArray(value)),
  )
}

export function getTraceMeta(trace: ChallengeTraceAttachment) {
  return Object.entries(trace).filter(
    ([key, value]) =>
      key !== 'dependencies' &&
      key !== 'id' &&
      key !== 'kind' &&
      value !== undefined &&
      (typeof value !== 'object' || value === null || Array.isArray(value)),
  )
}

export function describeOperand(
  operand: RuleOperandInspection<string>,
): string {
  if (operand.kind === 'field') {
    return operand.field
  }

  const predicate = operand.predicate

  if (!predicate) {
    return 'predicate'
  }

  if (predicate.field && predicate.namedCheck) {
    return `${predicate.field}?.${predicate.namedCheck.__check}`
  }

  if (predicate.field) {
    return `${predicate.field}?`
  }

  if (predicate.namedCheck) {
    return predicate.namedCheck.__check
  }

  return 'predicate'
}

export function describeInspection(
  inspection: RuleInspection<
    Record<string, { required?: boolean }>,
    Record<string, unknown>
  >,
): string {
  switch (inspection.kind) {
    case 'enabledWhen':
      return `enabledWhen(${inspection.target})`
    case 'fairWhen':
      return `fairWhen(${inspection.target})`
    case 'disables':
      return `disables(${describeOperand(inspection.source)}, [${inspection.targets.join(', ')}])`
    case 'requires':
      return `requires(${inspection.target}, ${inspection.dependencies.map(describeOperand).join(', ')})`
    case 'oneOf':
      return `oneOf(${inspection.groupName})`
    case 'anyOf':
      return `anyOf(${inspection.rules.length} rules)`
    case 'eitherOf':
      return `eitherOf(${inspection.groupName})`
    case 'custom':
      return `${inspection.type}(${inspection.targets.join(', ')})`
  }

  const exhaustive: never = inspection

  return exhaustive
}

export function describeEntry(entry: AnyRuleEntry): string {
  return entry.inspection
    ? describeInspection(entry.inspection)
    : `uninspectable rule #${entry.index}`
}
