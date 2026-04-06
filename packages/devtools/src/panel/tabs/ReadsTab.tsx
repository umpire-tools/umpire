import type { AnyReadInspection } from '../../types.js'
import { formatValue } from '../format.js'
import { pillStyle, scrollPaneStyle, theme } from '../theme.js'

type Props = {
  inspection: AnyReadInspection | null
}

function join(values: string[]) {
  return values.length > 0 ? values.join(', ') : 'none'
}

export function ReadsTab({ inspection }: Props) {
  if (!inspection) {
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
        Register a reads table to inspect computed dependencies here.
      </div>
    )
  }

  return (
    <div style={scrollPaneStyle()}>
      {inspection.bridges.length > 0 && (
        <div
          style={{
            alignItems: 'center',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            padding: 12,
          }}
        >
          {inspection.bridges.map((bridge) => (
            <span key={`${bridge.type}:${bridge.read}:${bridge.field}`} style={pillStyle(theme.accent, true)}>
              {bridge.read} {'->'} {bridge.field} ({bridge.type})
            </span>
          ))}
        </div>
      )}

      {inspection.graph.nodes.map((readId) => {
        const node = inspection.nodes[readId]

        return (
          <div
            key={readId}
            style={{
              borderBottom: `1px solid ${theme.border}`,
              display: 'grid',
              gap: 8,
              padding: 12,
            }}
          >
            <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ color: theme.fg, fontSize: 12 }}>{readId}</strong>
              <span style={pillStyle(theme.ruleOneOf, true)}>
                {formatValue(node.value)}
              </span>
            </div>
            <div style={{ color: theme.fgMuted, fontSize: 11 }}>
              fields: {join(node.dependsOnFields)}
            </div>
            <div style={{ color: theme.fgMuted, fontSize: 11 }}>
              reads: {join(node.dependsOnReads)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
