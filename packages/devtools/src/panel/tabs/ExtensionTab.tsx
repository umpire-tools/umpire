import type {
  DevtoolsExtensionSection,
  DevtoolsExtensionTone,
  ResolvedDevtoolsExtension,
} from '../../types.js'
import { formatValue } from '../format.js'
import { pillStyle, scrollPaneStyle, sectionHeadingStyle, theme } from '../theme.js'

type Props = {
  extension: ResolvedDevtoolsExtension
}

function toneColor(tone: DevtoolsExtensionTone | undefined) {
  if (tone === 'enabled') {
    return theme.enabled
  }

  if (tone === 'disabled') {
    return theme.disabled
  }

  if (tone === 'fair') {
    return theme.fair
  }

  if (tone === 'muted') {
    return theme.fgMuted
  }

  return theme.accent
}

function hasContent(section: DevtoolsExtensionSection) {
  if (section.kind === 'badges') {
    return section.badges.length > 0
  }

  if (section.kind === 'rows') {
    return section.rows.length > 0
  }

  return section.items.length > 0
}

function MetaRows({
  rows,
}: {
  rows: Array<{ label: string; value: unknown }>
}) {
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
      {rows.map((row) => (
        <>
          <dt key={`${row.label}:label`} style={{ color: theme.fgMuted, fontSize: 11 }}>
            {row.label}
          </dt>
          <dd key={`${row.label}:value`} style={{ color: theme.fg, fontSize: 11, margin: 0 }}>
            {formatValue(row.value, 80)}
          </dd>
        </>
      ))}
    </dl>
  )
}

function Section({
  section,
}: {
  section: DevtoolsExtensionSection
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
      {section.title && (
        <h3 style={sectionHeadingStyle()}>
          {section.title}
        </h3>
      )}

      {section.kind === 'badges' && (
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {section.badges.map((badge, index) => (
            <span key={`${index}:${String(badge.value)}`} style={pillStyle(toneColor(badge.tone), true)}>
              {formatValue(badge.value, 80)}
            </span>
          ))}
        </div>
      )}

      {section.kind === 'rows' && (
        <MetaRows rows={section.rows} />
      )}

      {section.kind === 'items' && (
        <div style={{ display: 'grid', gap: 0 }}>
          {section.items.map((item, index) => (
            <div
              key={item.id}
              style={{
                borderTop: index === 0 ? 'none' : `1px solid ${theme.border}`,
                display: 'grid',
                gap: 8,
                paddingTop: index === 0 ? 0 : 10,
              }}
            >
              <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ color: theme.fg, fontSize: 12 }}>
                  {item.title}
                </strong>
                {item.badge && (
                  <span style={pillStyle(toneColor(item.badge.tone), true)}>
                    {formatValue(item.badge.value)}
                  </span>
                )}
              </div>

              {item.body && (
                <div style={{ color: theme.fg, fontSize: 12 }}>
                  {item.body}
                </div>
              )}

              {item.rows && item.rows.length > 0 && (
                <MetaRows rows={item.rows} />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function ExtensionTab({ extension }: Props) {
  const sections = extension.view.sections.filter(hasContent)

  if (sections.length === 0) {
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
        {extension.view.empty ?? 'Nothing to inspect in this tab yet.'}
      </div>
    )
  }

  return (
    <div style={scrollPaneStyle()}>
      {sections.map((section, index) => (
        <Section key={`${extension.id}:${section.kind}:${section.title ?? index}`} section={section} />
      ))}
    </div>
  )
}
