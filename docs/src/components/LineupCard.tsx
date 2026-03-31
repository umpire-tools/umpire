import { useState, useMemo } from 'react'
import { umpire, enabledWhen, requires, oneOf } from '@umpire/core'
import type { FieldDef, FieldValues } from '@umpire/core'

// --- Roster data ---

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
  morrison:  { name: 'Jake Morrison',    positions: ['SP'],       bats: 'R', throws: 'R', role: 'starter' },
  flores:    { name: 'Eddie Flores',     positions: ['SP'],       bats: 'L', throws: 'L', role: 'starter' },
  whitfield: { name: 'Sam Whitfield',    positions: ['RP', 'CL'], bats: 'R', throws: 'R', role: 'reliever' },
}

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

    // Platoon: LF — Reyes (L) vs righty pitchers, Patterson (R) vs lefty pitchers
    oneOf('leftFieldPlatoon', {
      vsRighty: ['reyes'],
      vsLefty:  ['patterson'],
    }, {
      activeBranch: (_v, ctx) => ctx.opposingPitcher === 'L' ? 'vsLefty' : 'vsRighty',
      reason: 'platoon matchup',
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

// --- Component ---

const statusDot = (enabled: boolean, hasFlag: boolean) => {
  if (hasFlag) return { bg: '#fed023', label: 'flagged' }
  if (enabled) return { bg: '#6bfe9c', label: 'eligible' }
  return { bg: '#ff716c', label: 'out' }
}

export default function LineupCard() {
  const [opposingPitcher, setOpposingPitcher] = useState<'L' | 'R'>('R')
  const [injuries, setInjuries] = useState<Set<string>>(new Set())
  const [morrisonRested, setMorrisonRested] = useState(false)
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

  const penaltyFields = new Set(penalties.map(p => p.field))

  const toggleInjury = (id: string) => {
    setPrevValues(values)
    setInjuries(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const togglePitcher = () => {
    setPrevValues(values)
    setOpposingPitcher(p => p === 'L' ? 'R' : 'L')
  }

  const toggleRest = () => {
    setPrevValues(values)
    setMorrisonRested(r => !r)
  }

  const playerRows = Object.entries(roster).filter(([, p]) => p.role === 'position')
  const pitcherRows = Object.entries(roster).filter(([, p]) => p.role !== 'position')

  return (
    <div style={{ fontFamily: "'Work Sans', sans-serif", color: '#e0e0e0' }}>
      {/* Controls */}
      <div style={{
        display: 'flex', gap: '1rem', flexWrap: 'wrap',
        marginBottom: '1.25rem', alignItems: 'stretch',
      }}>
        <button
          onClick={togglePitcher}
          style={{
            background: opposingPitcher === 'L' ? 'rgba(107,254,156,0.15)' : 'rgba(254,208,35,0.15)',
            border: `1px solid ${opposingPitcher === 'L' ? 'rgba(107,254,156,0.4)' : 'rgba(254,208,35,0.4)'}`,
            color: opposingPitcher === 'L' ? '#6bfe9c' : '#fed023',
            margin: 0, padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem',
            fontWeight: 600, letterSpacing: '0.05em', lineHeight: 1.4,
          }}
        >
          Opposing pitcher: {opposingPitcher === 'L' ? 'LHP' : 'RHP'}
        </button>

        <button
          onClick={toggleRest}
          style={{
            background: morrisonRested ? 'rgba(107,254,156,0.15)' : 'rgba(255,113,108,0.12)',
            border: `1px solid ${morrisonRested ? 'rgba(107,254,156,0.4)' : 'rgba(255,113,108,0.3)'}`,
            color: morrisonRested ? '#6bfe9c' : '#ff716c',
            margin: 0, padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem',
            fontWeight: 600, letterSpacing: '0.05em', lineHeight: 1.4,
          }}
        >
          Morrison rest: {morrisonRested ? 'rested' : 'fatigued'}
        </button>
      </div>

      {/* Penalties */}
      {penalties.length > 0 && (
        <div style={{
          border: '1px solid rgba(254,208,35,0.3)', borderRadius: '12px',
          padding: '0.75rem 1rem', marginBottom: '1rem',
          background: 'linear-gradient(135deg, rgba(254,208,35,0.08), transparent 45%), rgba(18,18,18,0.96)',
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#fed023', marginBottom: '0.5rem',
          }}>
            🚩 Flag on the play
          </div>
          {penalties.map((p, i) => (
            <div key={i} style={{ fontSize: '0.85rem', color: '#e0e0e0', marginBottom: '0.25rem' }}>
              <strong>{roster[p.field]?.name ?? p.field}</strong>
              <span style={{ color: '#a0a0a0' }}> — {p.reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Position Players */}
      <div style={{
        border: '1px solid rgba(107,254,156,0.16)', borderRadius: '12px',
        overflow: 'hidden', marginBottom: '1rem',
        background: 'linear-gradient(135deg, rgba(107,254,156,0.04), transparent 45%), rgba(18,18,18,0.96)',
        boxShadow: '0 0 60px -15px rgba(107,254,156,0.1)',
      }}>
        <div style={{
          padding: '0.6rem 1rem',
          background: 'rgba(107,254,156,0.06)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#a0a0a0', display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Position Players</span>
          <span style={{ color: '#6bfe9c' }}>Boston Crabs</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(107,254,156,0.1)' }}>
              {['', 'Player', 'Pos', 'B/T', 'Status', 'Reason', ''].map((h, i) => (
                <th key={i} style={{
                  padding: '0.5rem 0.75rem', textAlign: 'left',
                  fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: '#a0a0a0', fontWeight: 500,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {playerRows.map(([id, player]) => {
              const av = availability[id]
              const flagged = penaltyFields.has(id)
              const dot = statusDot(av?.enabled ?? true, flagged)
              return (
                <tr key={id} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  opacity: av?.enabled ? 1 : 0.5,
                  transition: 'opacity 0.2s',
                }}>
                  <td style={{ padding: '0.5rem 0.75rem', width: '2rem' }}>
                    <span style={{
                      display: 'inline-block', width: '8px', height: '8px',
                      borderRadius: '50%', background: dot.bg,
                      boxShadow: `0 0 6px ${dot.bg}`,
                    }} />
                  </td>
                  <td style={{
                    padding: '0.5rem 0.75rem', fontWeight: 600,
                    color: av?.enabled ? '#f9f9f9' : '#808080',
                  }}>
                    {player.name}
                  </td>
                  <td style={{
                    padding: '0.5rem 0.75rem',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem',
                  }}>
                    {player.positions.join('/')}
                  </td>
                  <td style={{
                    padding: '0.5rem 0.75rem',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem',
                    color: '#a0a0a0',
                  }}>
                    {player.bats}/{player.throws}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.15rem 0.5rem',
                      borderRadius: '999px', fontSize: '0.7rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      fontWeight: 600,
                      background: av?.enabled
                        ? 'rgba(107,254,156,0.12)' : 'rgba(255,113,108,0.12)',
                      color: av?.enabled ? '#6bfe9c' : '#ff716c',
                    }}>
                      {av?.enabled ? 'eligible' : 'out'}
                    </span>
                  </td>
                  <td style={{
                    padding: '0.5rem 0.75rem', fontSize: '0.8rem',
                    fontStyle: 'italic', color: '#a0a0a0',
                  }}>
                    {av?.reason ?? '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', width: '2rem' }}>
                    <button
                      onClick={() => toggleInjury(id)}
                      title={injuries.has(id) ? 'Clear injury' : 'Add to IL'}
                      style={{
                        background: injuries.has(id) ? 'rgba(255,113,108,0.2)' : 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px', padding: '0.2rem 0.4rem',
                        cursor: 'pointer', fontSize: '0.75rem',
                        color: injuries.has(id) ? '#ff716c' : '#808080',
                      }}
                    >
                      {injuries.has(id) ? 'IL' : '🤕'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pitchers */}
      <div style={{
        border: '1px solid rgba(107,254,156,0.16)', borderRadius: '12px',
        overflow: 'hidden', marginBottom: '1rem',
        background: 'linear-gradient(135deg, rgba(254,208,35,0.04), transparent 45%), rgba(18,18,18,0.96)',
        boxShadow: '0 0 60px -15px rgba(107,254,156,0.1)',
      }}>
        <div style={{
          padding: '0.6rem 1rem',
          background: 'rgba(254,208,35,0.06)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#a0a0a0', display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Pitching Staff</span>
          <span style={{ color: '#fed023' }}>Tonight's Game</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(254,208,35,0.1)' }}>
              {['', 'Pitcher', 'Role', 'Throws', 'Status', 'Reason', ''].map((h, i) => (
                <th key={i} style={{
                  padding: '0.5rem 0.75rem', textAlign: 'left',
                  fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: '#a0a0a0', fontWeight: 500,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pitcherRows.map(([id, player]) => {
              const av = availability[id]
              const flagged = penaltyFields.has(id)
              const dot = statusDot(av?.enabled ?? true, flagged)
              return (
                <tr key={id} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  opacity: av?.enabled ? 1 : 0.5,
                  transition: 'opacity 0.2s',
                }}>
                  <td style={{ padding: '0.5rem 0.75rem', width: '2rem' }}>
                    <span style={{
                      display: 'inline-block', width: '8px', height: '8px',
                      borderRadius: '50%', background: dot.bg,
                      boxShadow: `0 0 6px ${dot.bg}`,
                    }} />
                  </td>
                  <td style={{
                    padding: '0.5rem 0.75rem', fontWeight: 600,
                    color: av?.enabled ? '#f9f9f9' : '#808080',
                  }}>
                    {player.name}
                  </td>
                  <td style={{
                    padding: '0.5rem 0.75rem',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem',
                  }}>
                    {player.positions.join('/')}
                  </td>
                  <td style={{
                    padding: '0.5rem 0.75rem',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem',
                    color: '#a0a0a0',
                  }}>
                    {player.throws}HP
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.15rem 0.5rem',
                      borderRadius: '999px', fontSize: '0.7rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      fontWeight: 600,
                      background: av?.enabled
                        ? 'rgba(107,254,156,0.12)' : 'rgba(255,113,108,0.12)',
                      color: av?.enabled ? '#6bfe9c' : '#ff716c',
                    }}>
                      {av?.enabled ? 'eligible' : 'out'}
                    </span>
                  </td>
                  <td style={{
                    padding: '0.5rem 0.75rem', fontSize: '0.8rem',
                    fontStyle: 'italic', color: '#a0a0a0',
                  }}>
                    {av?.reason ?? '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', width: '2rem' }}>
                    <button
                      onClick={() => toggleInjury(id)}
                      title={injuries.has(id) ? 'Clear injury' : 'Add to IL'}
                      style={{
                        background: injuries.has(id) ? 'rgba(255,113,108,0.2)' : 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px', padding: '0.2rem 0.4rem',
                        cursor: 'pointer', fontSize: '0.75rem',
                        color: injuries.has(id) ? '#ff716c' : '#808080',
                      }}
                    >
                      {injuries.has(id) ? 'IL' : '🤕'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}
