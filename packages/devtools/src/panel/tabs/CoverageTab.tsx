import type { AnyRuleEntry, DevtoolsCoverage, DevtoolsFieldCoverage } from '../../types.js'
import { getRuleTone, pillStyle, scrollPaneStyle, sectionHeadingStyle, theme } from '../theme.js'

type Props = {
  coverage: DevtoolsCoverage
  rules: AnyRuleEntry[]
}

const headerCellStyle = {
  borderBottom: `1px solid ${theme.border}`,
  color: theme.fgMuted,
  fontSize: 10,
  letterSpacing: '0.08em',
  padding: '8px 6px',
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const,
}

const fieldCellStyle = {
  borderBottom: `1px solid ${theme.border}`,
  color: theme.fg,
  fontSize: 11,
  padding: '8px 10px',
}

const boolCellStyle = {
  borderBottom: `1px solid ${theme.border}`,
  fontSize: 11,
  padding: '8px 6px',
  textAlign: 'center' as const,
}

function dot(seen: boolean) {
  return (
    <span style={{ color: seen ? theme.enabled : theme.unavailable }}>
      {seen ? '✓' : '○'}
    </span>
  )
}

function coverageScore(fc: DevtoolsFieldCoverage): number {
  const flags = [
    fc.seenEnabled,
    fc.seenDisabled,
    fc.seenFair,
    fc.seenFoul,
    fc.seenSatisfied,
    fc.seenUnsatisfied,
  ]
  return flags.filter(Boolean).length
}

export function CoverageTab({ coverage, rules }: Props) {
  const fieldEntries = Object.entries(coverage.fieldStates)
  const uncoveredRules = rules.filter(
    (entry) => !coverage.coveredRuleIds.has(entry.id),
  )
  const coveredCount = rules.length - uncoveredRules.length

  return (
    <div style={scrollPaneStyle()}>
      <section
        style={{
          borderBottom: `1px solid ${theme.border}`,
          display: 'grid',
          gap: 10,
          padding: 12,
        }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 10,
            justifyContent: 'space-between',
          }}
        >
          <h3 style={sectionHeadingStyle()}>Rule Coverage</h3>
          <span style={{ color: theme.fgMuted, fontSize: 11 }}>
            <span style={{ color: coveredCount === rules.length ? theme.enabled : theme.fg }}>
              {coveredCount}
            </span>
            {' / '}
            {rules.length} rules triggered
          </span>
        </div>

        {uncoveredRules.length === 0 ? (
          <div style={{ color: theme.enabled, fontSize: 11 }}>
            All rules have been triggered this session.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {uncoveredRules.map((entry) => {
              const kind = entry.inspection?.kind ?? 'custom'
              const tone = getRuleTone(kind)
              return (
                <div
                  key={entry.id}
                  style={{
                    alignItems: 'center',
                    display: 'flex',
                    gap: 8,
                  }}
                >
                  <span style={pillStyle(tone, true)}>{kind}</span>
                  <span style={{ color: theme.fgMuted, fontSize: 10 }}>
                    {entry.id}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section style={{ padding: 12 }}>
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 10,
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <h3 style={sectionHeadingStyle()}>Field State Coverage</h3>
        </div>

        {fieldEntries.length === 0 ? (
          <div style={{ color: theme.fgMuted, fontSize: 11 }}>
            No field data recorded yet.
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th
                  style={{
                    ...headerCellStyle,
                    padding: '8px 10px',
                    textAlign: 'left' as const,
                  }}
                >
                  Field
                </th>
                <th style={headerCellStyle}>En</th>
                <th style={headerCellStyle}>Dis</th>
                <th style={headerCellStyle}>Fair</th>
                <th style={headerCellStyle}>Foul</th>
                <th style={headerCellStyle}>Sat</th>
                <th style={headerCellStyle}>Unsat</th>
              </tr>
            </thead>
            <tbody>
              {fieldEntries.map(([field, fc]) => {
                const score = coverageScore(fc)
                const tone =
                  score === 6
                    ? theme.enabled
                    : score >= 4
                      ? theme.changed
                      : theme.fgMuted

                return (
                  <tr key={field}>
                    <td style={fieldCellStyle}>
                      <div
                        style={{ alignItems: 'center', display: 'flex', gap: 8 }}
                      >
                        <span
                          style={{
                            background: tone,
                            borderRadius: 999,
                            display: 'inline-block',
                            flexShrink: 0,
                            height: 6,
                            width: 6,
                          }}
                        />
                        {field}
                      </div>
                    </td>
                    <td style={boolCellStyle}>{dot(fc.seenEnabled)}</td>
                    <td style={boolCellStyle}>{dot(fc.seenDisabled)}</td>
                    <td style={boolCellStyle}>{dot(fc.seenFair)}</td>
                    <td style={boolCellStyle}>{dot(fc.seenFoul)}</td>
                    <td style={boolCellStyle}>{dot(fc.seenSatisfied)}</td>
                    <td style={boolCellStyle}>{dot(fc.seenUnsatisfied)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
