import { useState, useMemo, useCallback } from 'react'
import { umpire, enabledWhen, requires, oneOf } from '@umpire/core'
import type { FieldDef, FieldValues } from '@umpire/core'

// --- Roster ---

type Player = {
  name: string
  positions: string[]
  bats: 'L' | 'R' | 'S'
  throws: 'L' | 'R'
  role: 'position' | 'starter' | 'reliever'
}

const roster: Record<string, Player> = {
  summer:    { name: 'Jim Summer',       positions: ['CF'],       bats: 'R', throws: 'R', role: 'position' },
  delgado:   { name: 'Manny Delgado',    positions: ['1B'],       bats: 'L', throws: 'L', role: 'position' },
  vega:      { name: 'Ricky Vega',       positions: ['1B', 'DH'], bats: 'R', throws: 'R', role: 'position' },
  nakamura:  { name: 'Tommy Nakamura',   positions: ['SS'],       bats: 'S', throws: 'R', role: 'position' },
  kowalski:  { name: 'Dave Kowalski',    positions: ['3B'],       bats: 'R', throws: 'R', role: 'position' },
  reyes:     { name: 'Carlos Reyes',     positions: ['LF'],       bats: 'L', throws: 'L', role: 'position' },
  patterson: { name: 'Mike Patterson',   positions: ['LF', 'RF'], bats: 'R', throws: 'R', role: 'position' },
  chen:      { name: 'Billy Chen',       positions: ['C'],        bats: 'R', throws: 'R', role: 'position' },
  russo:     { name: 'Tony Russo',       positions: ['2B'],       bats: 'L', throws: 'R', role: 'position' },
  williams:  { name: 'Andre Williams',   positions: ['RF', 'CF'], bats: 'R', throws: 'R', role: 'position' },
  silva:     { name: 'Marco Silva',      positions: ['DH', 'LF'], bats: 'L', throws: 'L', role: 'position' },
  hartley:   { name: 'Chris Hartley',   positions: ['1B', 'DH'], bats: 'S', throws: 'R', role: 'position' },
  morrison:  { name: 'Jake Morrison',    positions: ['SP'],       bats: 'R', throws: 'R', role: 'starter' },
  flores:    { name: 'Eddie Flores',     positions: ['SP'],       bats: 'L', throws: 'L', role: 'starter' },
  whitfield: { name: 'Sam Whitfield',    positions: ['RP', 'CL'], bats: 'R', throws: 'R', role: 'reliever' },
}

// --- Lineup positions ---

type LineupSlot = {
  label: string
  position: string
}

const lineupSlots: LineupSlot[] = [
  { label: 'SP',  position: 'SP' },
  { label: '1',   position: 'C' },
  { label: '2',   position: '2B' },
  { label: '3',   position: 'SS' },
  { label: '4',   position: '1B' },
  { label: '5',   position: '3B' },
  { label: '6',   position: 'LF' },
  { label: '7',   position: 'CF' },
  { label: '8',   position: 'RF' },
  { label: '9',   position: 'DH' },
]

// --- Umpire setup ---

const fields: Record<string, FieldDef> = {}
for (const id of Object.keys(roster)) {
  fields[id] = {}
}
fields.morrisonRested = {}

type Ctx = { opposingPitcher: 'L' | 'R' }

const lineupUmp = umpire<typeof fields, Ctx>({
  fields,
  rules: [
    // Platoon: 1B — Delgado (L) vs righty pitchers, Vega (R) vs lefty pitchers
    oneOf('firstBasePlatoon', {
      vsRighty: ['delgado'],
      vsLefty:  ['vega'],
    }, {
      activeBranch: (_v, ctx) => ctx.opposingPitcher === 'L' ? 'vsLefty' : 'vsRighty',
      reason: 'platoon matchup',
    }),

    // Platoon: LF — Reyes (L) vs righty, Patterson (R) vs lefty
    oneOf('leftFieldPlatoon', {
      vsRighty: ['reyes'],
      vsLefty:  ['patterson'],
    }, {
      activeBranch: (_v, ctx) => ctx.opposingPitcher === 'L' ? 'vsLefty' : 'vsRighty',
      reason: 'platoon matchup',
    }),

    // Platoon: Silva (L) sits vs lefties
    enabledWhen('silva', (_v, ctx) => ctx.opposingPitcher !== 'L', {
      reason: 'platoon — lefty sits vs LHP',
    }),

    // Morrison can't start without rest
    requires('morrison', 'morrisonRested'),

    // Injuries disable players
    ...Object.keys(roster).map(id =>
      enabledWhen(id, (values) => !values[`${id}_injured`], {
        reason: 'on the injured list',
      })
    ),
  ],
})

// --- Styles ---

const mono = "'JetBrains Mono', monospace"
const colors = {
  green: '#6bfe9c',
  yellow: '#fed023',
  red: '#ff716c',
  dim: '#a0a0a0',
  bg: 'rgba(18,18,18,0.96)',
  surface: 'rgba(26,26,26,0.96)',
  white: '#f9f9f9',
  faint: 'rgba(255,255,255,0.04)',
}

// --- Component ---

export default function LineupCard() {
  const [opposingPitcher, setOpposingPitcher] = useState<'L' | 'R'>('R')
  const [injuries, setInjuries] = useState<Set<string>>(new Set())
  const [morrisonRested, setMorrisonRested] = useState(false)
  const [lineup, setLineup] = useState<Record<string, string | null>>(() => {
    const slots: Record<string, string | null> = {}
    for (const slot of lineupSlots) slots[slot.label] = null
    return slots
  })
  const [selectingSlot, setSelectingSlot] = useState<string | null>(null)
  const [prevValues, setPrevValues] = useState<FieldValues<typeof fields> | null>(null)

  const values: FieldValues<typeof fields> = useMemo(() => {
    const v: Record<string, unknown> = {}
    for (const id of Object.keys(roster)) {
      v[id] = injuries.has(id) ? undefined : id
      v[`${id}_injured`] = injuries.has(id) || undefined
    }
    v.morrisonRested = morrisonRested || undefined
    return v as FieldValues<typeof fields>
  }, [injuries, morrisonRested])

  const context: Ctx = useMemo(() => ({ opposingPitcher }), [opposingPitcher])

  const availability = useMemo(
    () => lineupUmp.check(values, context),
    [values, context],
  )

  const penalties = useMemo(() => {
    if (!prevValues) return []
    return lineupUmp.flag(
      { values: prevValues, context },
      { values, context },
    )
  }, [values, context, prevValues])

  // Players currently assigned to a slot
  const assignedPlayers = new Set(Object.values(lineup).filter(Boolean) as string[])

  // When availability changes, remove ineligible players from lineup
  useMemo(() => {
    let changed = false
    const next = { ...lineup }
    for (const [slot, playerId] of Object.entries(next)) {
      if (playerId && availability[playerId] && !availability[playerId].enabled) {
        next[slot] = null
        changed = true
      }
    }
    if (changed) setLineup(next)
  }, [availability])

  const toggleInjury = useCallback((id: string) => {
    setPrevValues(values)
    setInjuries(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [values])

  const togglePitcher = useCallback(() => {
    setPrevValues(values)
    setOpposingPitcher(p => p === 'L' ? 'R' : 'L')
  }, [values])

  const toggleRest = useCallback(() => {
    setPrevValues(values)
    setMorrisonRested(r => !r)
  }, [values])

  const assignPlayer = useCallback((slot: string, playerId: string) => {
    setLineup(prev => ({ ...prev, [slot]: playerId }))
    setSelectingSlot(null)
  }, [])

  const clearSlot = useCallback((slot: string) => {
    setLineup(prev => ({ ...prev, [slot]: null }))
  }, [])

  // Get eligible players for a lineup slot
  const getEligibleForSlot = (slot: LineupSlot) => {
    return Object.entries(roster).filter(([id, player]) => {
      if (!availability[id]?.enabled) return false
      if (assignedPlayers.has(id) && lineup[slot.label] !== id) return false
      if (slot.position === 'DH') return player.role === 'position'
      return player.positions.includes(slot.position)
    })
  }

  return (
    <div style={{ fontFamily: "'Work Sans', sans-serif", color: colors.white }}>
      {/* Controls */}
      <div style={{
        display: 'flex', gap: '0.75rem', flexWrap: 'wrap',
        marginBottom: '1rem', alignItems: 'stretch',
      }}>
        <button onClick={togglePitcher} style={{
          background: opposingPitcher === 'L' ? 'rgba(107,254,156,0.15)' : 'rgba(254,208,35,0.15)',
          border: `1px solid ${opposingPitcher === 'L' ? 'rgba(107,254,156,0.4)' : 'rgba(254,208,35,0.4)'}`,
          color: opposingPitcher === 'L' ? colors.green : colors.yellow,
          margin: 0, padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer',
          fontFamily: mono, fontSize: '0.8rem', fontWeight: 600,
          letterSpacing: '0.05em', lineHeight: 1.4,
        }}>
          Opposing: {opposingPitcher === 'L' ? 'LHP' : 'RHP'}
        </button>
        <button onClick={toggleRest} style={{
          background: morrisonRested ? 'rgba(107,254,156,0.15)' : 'rgba(255,113,108,0.12)',
          border: `1px solid ${morrisonRested ? 'rgba(107,254,156,0.4)' : 'rgba(255,113,108,0.3)'}`,
          color: morrisonRested ? colors.green : colors.red,
          margin: 0, padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer',
          fontFamily: mono, fontSize: '0.8rem', fontWeight: 600,
          letterSpacing: '0.05em', lineHeight: 1.4,
        }}>
          Morrison: {morrisonRested ? 'rested' : 'fatigued'}
        </button>
      </div>

      {/* Penalties */}
      {penalties.length > 0 && (
        <div style={{
          border: '1px solid rgba(254,208,35,0.3)', borderRadius: '10px',
          padding: '0.6rem 1rem', marginBottom: '1rem',
          background: 'linear-gradient(135deg, rgba(254,208,35,0.08), transparent 45%), rgba(18,18,18,0.96)',
        }}>
          <div style={{
            fontFamily: mono, fontSize: '0.65rem', letterSpacing: '0.12em',
            textTransform: 'uppercase', color: colors.yellow, marginBottom: '0.4rem',
          }}>
            🚩 Flag on the play
          </div>
          {penalties.map((p, i) => (
            <div key={i} style={{ fontSize: '0.8rem', color: colors.white, marginBottom: '0.15rem' }}>
              <strong>{roster[p.field]?.name ?? p.field}</strong>
              <span style={{ color: colors.dim }}> — {p.reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Two-panel layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'start' }}>

        {/* Left: Roster/Bench */}
        <div style={{
          border: '1px solid rgba(107,254,156,0.12)', borderRadius: '10px',
          overflow: 'hidden', background: colors.bg,
        }}>
          <div style={{
            padding: '0.5rem 0.75rem', background: 'rgba(107,254,156,0.06)',
            fontFamily: mono, fontSize: '0.65rem', letterSpacing: '0.12em',
            textTransform: 'uppercase', color: colors.dim,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>Roster</span>
            <span style={{ color: colors.green }}>Boston Crabs</span>
          </div>
          <div style={{ padding: '0.25rem 0' }}>
            {Object.entries(roster).map(([id, player]) => {
              const av = availability[id]
              const inLineup = assignedPlayers.has(id)
              const enabled = av?.enabled ?? true
              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.35rem 0.75rem',
                  opacity: enabled ? (inLineup ? 0.4 : 1) : 0.35,
                  borderBottom: `1px solid ${colors.faint}`,
                  transition: 'opacity 0.2s',
                }}>
                  <span style={{
                    width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                    background: !enabled ? colors.red : inLineup ? colors.dim : colors.green,
                    boxShadow: `0 0 5px ${!enabled ? colors.red : inLineup ? 'transparent' : colors.green}`,
                  }} />
                  <span style={{
                    flex: 1, fontSize: '0.8rem', fontWeight: enabled ? 600 : 400,
                    color: enabled ? colors.white : '#666',
                    textDecoration: inLineup ? 'line-through' : 'none',
                  }}>
                    {player.name}
                  </span>
                  <span style={{
                    fontFamily: mono, fontSize: '0.65rem', color: colors.dim,
                    minWidth: '2.5rem',
                  }}>
                    {player.positions.join('/')}
                  </span>
                  <span style={{
                    fontFamily: mono, fontSize: '0.65rem', color: colors.dim,
                    width: '2rem', textAlign: 'center',
                  }}>
                    {player.bats}/{player.throws}
                  </span>
                  {enabled && !inLineup ? null : !enabled ? (
                    <span style={{
                      fontFamily: mono, fontSize: '0.6rem', color: colors.red,
                      padding: '0.1rem 0.35rem', borderRadius: '4px',
                      background: 'rgba(255,113,108,0.1)', whiteSpace: 'nowrap',
                    }}>
                      {av?.reason ?? 'out'}
                    </span>
                  ) : inLineup ? (
                    <span style={{
                      fontFamily: mono, fontSize: '0.6rem', color: colors.green,
                      padding: '0.1rem 0.35rem', borderRadius: '4px',
                      background: 'rgba(107,254,156,0.1)',
                    }}>
                      in lineup
                    </span>
                  ) : null}
                  <button
                    onClick={() => toggleInjury(id)}
                    title={injuries.has(id) ? 'Clear injury' : 'Add to IL'}
                    style={{
                      background: injuries.has(id) ? 'rgba(255,113,108,0.2)' : 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '4px', padding: '0.15rem 0.3rem',
                      cursor: 'pointer', fontSize: '0.7rem', lineHeight: 1,
                      color: injuries.has(id) ? colors.red : '#666',
                      margin: 0,
                    }}
                  >
                    {injuries.has(id) ? '✕' : '🤕'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Lineup Card */}
        <div style={{
          border: '1px solid rgba(254,208,35,0.12)', borderRadius: '10px',
          overflow: 'hidden', background: colors.bg,
        }}>
          <div style={{
            padding: '0.5rem 0.75rem', background: 'rgba(254,208,35,0.06)',
            fontFamily: mono, fontSize: '0.65rem', letterSpacing: '0.12em',
            textTransform: 'uppercase', color: colors.dim,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>Tonight's Lineup</span>
            <span style={{ color: colors.yellow }}>vs {opposingPitcher === 'L' ? 'LHP' : 'RHP'}</span>
          </div>
          <div style={{ padding: '0.25rem 0' }}>
            {lineupSlots.map((slot) => {
              const playerId = lineup[slot.label]
              const player = playerId ? roster[playerId] : null
              const eligible = getEligibleForSlot(slot)
              const isSelecting = selectingSlot === slot.label
              const isSP = slot.position === 'SP'

              return (
                <div key={slot.label} style={{
                  borderBottom: `1px solid ${colors.faint}`,
                  ...(isSP ? { borderBottom: `1px solid rgba(254,208,35,0.15)` } : {}),
                }}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.35rem 0.75rem', cursor: 'pointer',
                      background: isSelecting ? 'rgba(107,254,156,0.06)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onClick={() => {
                      if (playerId) {
                        clearSlot(slot.label)
                      } else {
                        setSelectingSlot(isSelecting ? null : slot.label)
                      }
                    }}
                  >
                    <span style={{
                      fontFamily: mono, fontSize: '0.7rem', fontWeight: 700,
                      color: isSP ? colors.yellow : colors.dim,
                      width: '1.5rem', textAlign: 'center',
                    }}>
                      {slot.label}
                    </span>
                    <span style={{
                      fontFamily: mono, fontSize: '0.6rem', color: colors.dim,
                      width: '1.8rem', textAlign: 'center',
                      padding: '0.1rem 0', borderRadius: '3px',
                      background: 'rgba(255,255,255,0.04)',
                    }}>
                      {slot.position}
                    </span>
                    {player ? (
                      <>
                        <span style={{
                          flex: 1, fontSize: '0.8rem', fontWeight: 600,
                          color: colors.white,
                        }}>
                          {player.name}
                        </span>
                        <span style={{
                          fontFamily: mono, fontSize: '0.6rem', color: colors.dim,
                        }}>
                          {player.bats}/{player.throws}
                        </span>
                        <span style={{
                          fontSize: '0.65rem', color: colors.dim, cursor: 'pointer',
                        }} title="Remove from lineup">
                          ✕
                        </span>
                      </>
                    ) : (
                      <span style={{
                        flex: 1, fontSize: '0.75rem', fontStyle: 'italic',
                        color: eligible.length > 0 ? '#555' : colors.red,
                      }}>
                        {eligible.length > 0
                          ? `${eligible.length} eligible`
                          : 'no eligible players'}
                      </span>
                    )}
                  </div>

                  {/* Dropdown: eligible players */}
                  {isSelecting && eligible.length > 0 && (
                    <div style={{
                      padding: '0.15rem 0', marginLeft: '2.75rem', marginRight: '0.75rem',
                      marginBottom: '0.35rem',
                      borderRadius: '6px', overflow: 'hidden',
                      border: '1px solid rgba(107,254,156,0.15)',
                      background: colors.surface,
                    }}>
                      {eligible.map(([id, p]) => (
                        <div
                          key={id}
                          onClick={(e) => { e.stopPropagation(); assignPlayer(slot.label, id) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.3rem 0.6rem', cursor: 'pointer',
                            fontSize: '0.75rem',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(107,254,156,0.08)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: colors.green, flexShrink: 0,
                          }} />
                          <span style={{ fontWeight: 500, color: colors.white }}>{p.name}</span>
                          <span style={{
                            fontFamily: mono, fontSize: '0.6rem', color: colors.dim,
                          }}>
                            {p.bats}/{p.throws}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
