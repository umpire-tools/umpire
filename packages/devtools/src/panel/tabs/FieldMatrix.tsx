import type { AnyScorecard } from '../../types.js'
import { formatValue } from '../format.js'
import { getFieldTone, scrollPaneStyle, theme } from '../theme.js'

type Props = {
  onSelectField: (field: string) => void
  scorecard: AnyScorecard
  selectedField: string | null
}

const headerCellStyle = {
  borderBottom: `1px solid ${theme.border}`,
  color: theme.fgMuted,
  fontSize: 11,
  letterSpacing: '0.08em',
  padding: '10px 12px',
  textAlign: 'left',
  textTransform: 'uppercase',
}

const bodyCellStyle = {
  borderBottom: `1px solid ${theme.border}`,
  fontSize: 12,
  padding: '10px 12px',
  verticalAlign: 'top',
}

function flag(value: boolean) {
  return value ? 'yes' : 'no'
}

export function FieldMatrix({ onSelectField, scorecard, selectedField }: Props) {
  const fields = scorecard.graph.nodes
    .map((field) => scorecard.fields[field])
    .filter(Boolean)

  return (
    <div style={scrollPaneStyle()}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...headerCellStyle, width: '34%' }}>Field</th>
            <th style={{ ...headerCellStyle, width: '26%' }}>Value</th>
            <th style={headerCellStyle}>Enabled</th>
            <th style={headerCellStyle}>Fair</th>
            <th style={headerCellStyle}>Req</th>
            <th style={headerCellStyle}>Changed</th>
            <th style={headerCellStyle}>Foul</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => {
            const tone = getFieldTone(field)
            const isSelected = selectedField === field.field

            return (
              <tr
                key={field.field}
                onClick={() => onSelectField(field.field)}
                style={{
                  background: isSelected ? `${theme.accent}16` : 'transparent',
                  boxShadow: `inset 3px 0 0 ${tone}`,
                  cursor: 'pointer',
                }}
              >
                <td style={bodyCellStyle}>
                  <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                    <span
                      style={{
                        background: tone,
                        borderRadius: 999,
                        display: 'inline-block',
                        height: 8,
                        width: 8,
                      }}
                    />
                    <strong style={{ color: theme.fg, fontSize: 12 }}>{field.field}</strong>
                  </div>
                  <div style={{ color: theme.fgMuted, fontSize: 11, marginTop: 6 }}>
                    {field.reason ?? 'Inspect trace'}
                  </div>
                </td>
                <td style={{ ...bodyCellStyle, color: theme.fg }}>
                  {formatValue(field.value)}
                </td>
                <td style={bodyCellStyle}>{flag(field.enabled)}</td>
                <td style={bodyCellStyle}>{flag(field.fair)}</td>
                <td style={bodyCellStyle}>{flag(field.required)}</td>
                <td style={bodyCellStyle}>{flag(field.changed)}</td>
                <td style={bodyCellStyle}>{field.foul ? 'yes' : 'no'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
