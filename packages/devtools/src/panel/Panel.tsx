import { useEffect, useMemo, useState } from 'preact/hooks'
import { snapshot, subscribe } from '../registry.js'
import type {
  AnyScorecard,
  DevtoolsTab,
  MountOptions,
  RegistryEntry,
} from '../types.js'
import { ChallengeDrawer } from './ChallengeDrawer.js'
import { FoulLog } from './tabs/FoulLog.js'
import { FieldMatrix } from './tabs/FieldMatrix.js'
import { GraphTab } from './tabs/GraphTab.js'
import { ReadsTab } from './tabs/ReadsTab.js'
import { fontFamily, scrollPaneStyle, sectionHeadingStyle, tabStyle, theme } from './theme.js'

type Props = {
  options: Required<MountOptions>
}

function useRegistryEntries() {
  const [entries, setEntries] = useState(() => snapshot())

  useEffect(() => subscribe(() => {
    setEntries(snapshot())
  }), [])

  return entries
}

function panelAnchor(position: Required<MountOptions>['position'], offset: Required<MountOptions>['offset']) {
  const anchor: Record<string, string | number> = {}

  if (position.startsWith('top')) {
    anchor.top = offset.y
  } else {
    anchor.bottom = offset.y
  }

  if (position.endsWith('left')) {
    anchor.left = offset.x
  } else {
    anchor.right = offset.x
  }

  return anchor
}

function resolveTabs(entry: RegistryEntry | null): DevtoolsTab[] {
  return entry?.reads
    ? ['matrix', 'fouls', 'graph', 'reads']
    : ['matrix', 'fouls', 'graph']
}

function EmptyState() {
  return (
    <div
      style={{
        ...scrollPaneStyle(),
        color: theme.fgMuted,
        display: 'grid',
        lineHeight: 1.7,
        padding: 18,
        placeItems: 'center',
        textAlign: 'center',
      }}
    >
      <div>
        <div style={{ color: theme.fg, marginBottom: 8 }}>No Umpire instances registered.</div>
        <div>Call register(id, ump, values, conditions) from your app to populate the panel.</div>
      </div>
    </div>
  )
}

export function Panel({ options }: Props) {
  const entries = useRegistryEntries()
  const entryList = useMemo(() => [...entries.values()], [entries])
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(entryList[0]?.id ?? null)
  const [selectedField, setSelectedField] = useState<string | null>(null)
  const [tab, setTab] = useState<DevtoolsTab>(options.defaultTab)

  useEffect(() => {
    if (entryList.length === 0) {
      setActiveId(null)
      setSelectedField(null)
      return
    }

    if (!activeId || !entries.has(activeId)) {
      setActiveId(entryList[0].id)
    }
  }, [activeId, entries, entryList])

  const activeEntry = activeId ? entries.get(activeId) ?? null : null
  const activeTabs = resolveTabs(activeEntry)
  const activeScorecard = activeEntry?.scorecard ?? null

  useEffect(() => {
    if (!activeTabs.includes(tab)) {
      setTab('matrix')
    }
  }, [activeTabs, tab])

  useEffect(() => {
    setSelectedField(null)
  }, [activeId])

  const challenge = useMemo(() => {
    if (!activeEntry || !selectedField) {
      return null
    }

    return activeEntry.ump.challenge(
      selectedField,
      activeEntry.snapshot.values,
      activeEntry.snapshot.conditions,
      activeEntry.previous?.values,
    )
  }, [activeEntry, selectedField])

  const anchor = panelAnchor(options.position, options.offset)
  const stackDirection = options.position.startsWith('bottom') ? 'column-reverse' : 'column'
  const alignItems = options.position.endsWith('left') ? 'flex-start' : 'flex-end'

  return (
    <div
      style={{
        ...anchor,
        alignItems,
        display: 'flex',
        flexDirection: stackDirection,
        gap: 8,
        pointerEvents: 'none',
        position: 'fixed',
      }}
    >
      <button
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          alignItems: 'center',
          appearance: 'none',
          background: open ? theme.surfaceRaised : theme.accent,
          border: `1px solid ${open ? theme.accent : theme.accent}`,
          borderRadius: 999,
          color: open ? theme.accent : theme.bg,
          cursor: 'pointer',
          display: 'inline-flex',
          fontFamily,
          fontSize: 12,
          fontWeight: 700,
          gap: 8,
          justifyContent: 'center',
          minHeight: 34,
          minWidth: 92,
          padding: '0 14px',
          pointerEvents: 'auto',
          textTransform: 'lowercase',
        }}
        type="button"
      >
        <span>🛂</span>
        <span>umpire</span>
      </button>

      {open && (
        <div
          style={{
            background: theme.bg,
            border: `1px solid ${theme.border}`,
            borderRadius: 16,
            boxShadow: theme.shadow,
            color: theme.fg,
            display: 'grid',
            fontFamily,
            gridTemplateRows: 'auto auto auto minmax(0, 1fr)',
            height: 'min(480px, calc(100vh - 96px))',
            maxWidth: 'min(360px, calc(100vw - 32px))',
            overflow: 'hidden',
            pointerEvents: 'auto',
            width: 'min(360px, calc(100vw - 32px))',
          }}
        >
          <div
            style={{
              alignItems: 'center',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'grid', gap: 5 }}>
              <strong style={{ color: theme.fg, fontSize: 13 }}>Umpire DevTools</strong>
              <span style={{ color: theme.fgMuted, fontSize: 11 }}>
                {entryList.length} registered {entryList.length === 1 ? 'instance' : 'instances'}
              </span>
            </div>

            {activeEntry && (
              <div style={{ color: theme.fgMuted, fontSize: 11 }}>
                render #{activeEntry.renderIndex}
              </div>
            )}
          </div>

          <div
            style={{
              borderBottom: `1px solid ${theme.border}`,
              display: 'grid',
              gap: 8,
              padding: 12,
            }}
          >
            <label htmlFor="umpire-devtools-instance" style={sectionHeadingStyle()}>
              Instance
            </label>
            <select
              id="umpire-devtools-instance"
              onChange={(event) => setActiveId(event.currentTarget.value)}
              style={{
                appearance: 'none',
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                color: theme.fg,
                fontFamily,
                fontSize: 12,
                padding: '10px 12px',
              }}
              value={activeEntry?.id ?? ''}
            >
              {entryList.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.id}
                </option>
              ))}
              {entryList.length === 0 && <option value="">No instances</option>}
            </select>
          </div>

          <div
            style={{
              alignItems: 'center',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              padding: '8px 12px',
            }}
          >
            {activeTabs.map((entryTab) => (
              <button
                key={entryTab}
                onClick={() => {
                  setSelectedField(null)
                  setTab(entryTab)
                }}
                style={tabStyle(tab === entryTab && !selectedField)}
                type="button"
              >
                {entryTab}
              </button>
            ))}
          </div>

          <div style={{ minHeight: 0 }}>
            {!activeScorecard || !activeEntry ? (
              <EmptyState />
            ) : challenge && selectedField ? (
              <ChallengeDrawer
                field={selectedField}
                onBack={() => setSelectedField(null)}
                trace={challenge}
              />
            ) : (
              <PanelBody
                entry={activeEntry}
                onSelectField={setSelectedField}
                scorecard={activeScorecard}
                selectedField={selectedField}
                tab={tab}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PanelBody({
  entry,
  onSelectField,
  scorecard,
  selectedField,
  tab,
}: {
  entry: RegistryEntry
  onSelectField: (field: string) => void
  scorecard: AnyScorecard
  selectedField: string | null
  tab: DevtoolsTab
}) {
  if (tab === 'fouls') {
    return <FoulLog events={entry.foulLog} />
  }

  if (tab === 'graph') {
    return (
      <GraphTab
        onSelectField={onSelectField}
        scorecard={scorecard}
        selectedField={selectedField}
      />
    )
  }

  if (tab === 'reads') {
    return <ReadsTab inspection={entry.reads} />
  }

  return (
    <FieldMatrix
      onSelectField={onSelectField}
      scorecard={scorecard}
      selectedField={selectedField}
    />
  )
}
