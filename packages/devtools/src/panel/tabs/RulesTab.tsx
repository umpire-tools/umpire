import type { RuleInspection } from '@umpire/core'
import type { AnyRuleEntry } from '../../types.js'
import { getRuleTone, pillStyle, scrollPaneStyle, theme } from '../theme.js'

type Props = {
  activeRuleIds: Set<string>
  rules: AnyRuleEntry[]
}

type AnyRuleInspection = RuleInspection<
  Record<string, { required?: boolean }>,
  Record<string, unknown>
>

function describeOperand(operand: { kind: string; field?: string }): string {
  if (operand.kind === 'field' && typeof operand.field === 'string') {
    return operand.field
  }
  return 'predicate'
}

function describeInspection(inspection: AnyRuleInspection): string {
  if (inspection.kind === 'enabledWhen') {
    return `enabledWhen(${inspection.target})`
  }
  if (inspection.kind === 'disables') {
    return `disables(${describeOperand(inspection.source)}, [${inspection.targets.join(', ')}])`
  }
  if (inspection.kind === 'fairWhen') {
    return `fairWhen(${inspection.target})`
  }
  if (inspection.kind === 'requires') {
    return `requires(${inspection.target}, ${inspection.dependencies.map(describeOperand).join(', ')})`
  }
  if (inspection.kind === 'oneOf') {
    return `oneOf(${inspection.groupName})`
  }
  if (inspection.kind === 'anyOf') {
    return `anyOf(${inspection.rules.length} rules)`
  }
  if (inspection.kind === 'eitherOf') {
    return `eitherOf(${inspection.groupName})`
  }
  if (inspection.kind === 'custom') {
    return `${inspection.type}(${inspection.targets.join(', ')})`
  }
  const _exhaustive: never = inspection
  return _exhaustive
}

function describeEntry(entry: AnyRuleEntry): string {
  return entry.inspection
    ? describeInspection(entry.inspection as AnyRuleInspection)
    : `uninspectable rule #${entry.index}`
}

export function RulesTab({ activeRuleIds, rules }: Props) {
  if (rules.length === 0) {
    return (
      <div
        style={{
          ...scrollPaneStyle(),
          color: theme.fgMuted,
          display: 'grid',
          lineHeight: 1.6,
          padding: 16,
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        No inspectable rules found for this instance.
      </div>
    )
  }

  return (
    <div style={scrollPaneStyle()}>
      {rules.map((entry) => {
        const kind = entry.inspection?.kind ?? 'custom'
        const tone = getRuleTone(kind)
        const isActive = activeRuleIds.has(entry.id)

        return (
          <div
            key={entry.id}
            style={{
              borderBottom: `1px solid ${theme.border}`,
              borderLeft: `3px solid ${isActive ? tone : theme.border}`,
              display: 'grid',
              gap: 6,
              padding: '10px 12px 10px 14px',
            }}
          >
            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                gap: 8,
                justifyContent: 'space-between',
              }}
            >
              <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                <span style={pillStyle(tone, true)}>{kind}</span>
                {isActive && <span style={pillStyle(tone, false)}>active</span>}
              </div>
              <span style={{ color: theme.fgMuted, fontSize: 10 }}>
                #{entry.index}
              </span>
            </div>
            <div style={{ color: theme.fg, fontSize: 11 }}>
              {describeEntry(entry)}
            </div>
            <div style={{ color: theme.fgMuted, fontSize: 10 }}>{entry.id}</div>
          </div>
        )
      })}
    </div>
  )
}
