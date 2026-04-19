import { isPlainRecord } from '@umpire/core/guards'
import type { AnySnapshot } from '../../types.js'
import { formatValue } from '../format.js'
import { fontFamily, scrollPaneStyle, sectionHeadingStyle, theme } from '../theme.js'

type Props = {
  current: AnySnapshot
  previous: AnySnapshot | null
}

function ConditionsValue({ value }: { value: unknown }) {
  if (value === undefined) {
    return (
      <div style={{ color: theme.fgMuted, fontSize: 11 }}>
        No conditions
      </div>
    )
  }

  if (!isPlainRecord(value)) {
    return (
      <code style={{ color: theme.fg, fontFamily, fontSize: 11 }}>
        {formatValue(value, 120)}
      </code>
    )
  }

  const entries = Object.entries(value)

  if (entries.length === 0) {
    return (
      <div style={{ color: theme.fgMuted, fontSize: 11 }}>
        Empty object
      </div>
    )
  }

  return (
    <dl
      style={{
        columnGap: 12,
        display: 'grid',
        gridTemplateColumns: 'max-content minmax(0, 1fr)',
        margin: 0,
        rowGap: 6,
      }}
    >
      {entries.map(([key, entryValue]) => (
        <>
          <dt key={`${key}:label`} style={{ color: theme.fgMuted, fontSize: 11 }}>
            {key}
          </dt>
          <dd key={`${key}:value`} style={{ color: theme.fg, fontSize: 11, margin: 0 }}>
            {formatValue(entryValue, 80)}
          </dd>
        </>
      ))}
    </dl>
  )
}

function ConditionsCard({
  title,
  value,
}: {
  title: string
  value: unknown
}) {
  return (
    <section
      style={{
        borderBottom: `1px solid ${theme.border}`,
        display: 'grid',
        gap: 8,
        padding: 12,
      }}
    >
      <h3 style={sectionHeadingStyle()}>
        {title}
      </h3>
      <ConditionsValue value={value} />
    </section>
  )
}

export function ConditionsTab({ current, previous }: Props) {
  return (
    <div style={scrollPaneStyle()}>
      <ConditionsCard title="Current Conditions" value={current.conditions} />
      {previous && (
        <ConditionsCard title="Previous Conditions" value={previous.conditions} />
      )}
    </div>
  )
}
