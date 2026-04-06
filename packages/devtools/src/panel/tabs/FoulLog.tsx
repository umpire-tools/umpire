import type { DevtoolsFoulEvent } from '../../types.js'
import { formatTimestamp, formatValue } from '../format.js'
import { pillStyle, scrollPaneStyle, theme } from '../theme.js'

type Props = {
  events: DevtoolsFoulEvent[]
}

export function FoulLog({ events }: Props) {
  if (events.length === 0) {
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
        No fouls yet. This log fills when a field becomes disabled while still holding a value.
      </div>
    )
  }

  return (
    <div style={scrollPaneStyle()}>
      {[...events].reverse().map((event) => (
        <div
          key={`${event.renderIndex}:${event.field}:${event.timestamp}`}
          style={{
            borderBottom: `1px solid ${theme.border}`,
            display: 'grid',
            gap: 8,
            padding: 12,
          }}
        >
          <div style={{ alignItems: 'center', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            <strong style={{ color: theme.fg, fontSize: 12 }}>{event.field}</strong>
            <span style={pillStyle(event.cascaded ? theme.fair : theme.disabled)}>
              {event.cascaded ? 'cascade' : 'direct'}
            </span>
          </div>
          <div style={{ color: theme.fgMuted, fontSize: 11 }}>
            render {event.renderIndex} at {formatTimestamp(event.timestamp)}
          </div>
          <div style={{ color: theme.fg, fontSize: 12 }}>{event.reason}</div>
          <div style={{ color: theme.fgMuted, fontSize: 11 }}>
            suggested reset: {formatValue(event.suggestedValue)}
          </div>
        </div>
      ))}
    </div>
  )
}
