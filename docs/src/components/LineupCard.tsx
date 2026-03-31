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
  hartley:   { name: 'Chris Hartley',    positions: ['1B', 'DH'], bats: 'S', throws: 'R', role: 'position' },
  morrison:  { name: 'Jake Morrison',    positions: ['SP'],       bats: 'R', throws: 'R', role: 'starter' },
  flores:    { name: 'Eddie Flores',     positions: ['SP'],       bats: 'L', throws: 'L', role: 'starter' },
  whitfield: { name: 'Sam Whitfield',    positions: ['RP', 'CL'], bats: 'R', throws: 'R', role: 'reliever' },
}

// --- Lineup positions ---

type LineupSlot = { label: string; position: string }

const lineupSlots: LineupSlot[] = [
  { label: 'SP', position: 'SP' },
  { label: '1',  position: 'C' },
  { label: '2',  position: '2B' },
  { label: '3',  position: 'SS' },
  { label: '4',  position: '1B' },
  { label: '5',  position: '3B' },
  { label: '6',  position: 'LF' },
  { label: '7',  position: 'CF' },
  { label: '8',  position: 'RF' },
  { label: '9',  position: 'DH' },
]

// --- Umpire setup ---

const fields: Record<string, FieldDef> = {}
for (const id of Object.keys(roster)) fields[id] = {}
fields.morrisonRested = {}

type Cond = { opposingPitcher: 'L' | 'R' }

const lineupUmp = umpire<typeof fields, Cond>({
  fields,
  rules: [
    oneOf('firstBasePlatoon', {
      vsRighty: ['delgado'],
      vsLefty:  ['vega'],
    }, {
      activeBranch: (_v, cond) => cond.opposingPitcher === 'L' ? 'vsLefty' : 'vsRighty',
      reason: 'platoon matchup',
    }),
    oneOf('leftFieldPlatoon', {
      vsRighty: ['reyes'],
      vsLefty:  ['patterson'],
    }, {
      activeBranch: (_v, cond) => cond.opposingPitcher === 'L' ? 'vsLefty' : 'vsRighty',
      reason: 'platoon matchup',
    }),
    enabledWhen('silva', (_v, cond) => cond.opposingPitcher !== 'L', {
      reason: 'platoon — lefty sits vs LHP',
    }),
    requires('morrison', 'morrisonRested'),
    ...Object.keys(roster).map(id =>
      enabledWhen(id, (values) => !values[`${id}_injured`], {
        reason: 'on the injured list',
      })
    ),
  ],
})

// --- Helpers ---

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
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

  const conditions: Cond = useMemo(() => ({ opposingPitcher }), [opposingPitcher])
  const availability = useMemo(() => lineupUmp.check(values, conditions), [values, conditions])

  const penalties = useMemo(() => {
    if (!prevValues) return []
    return lineupUmp.flag({ values: prevValues, conditions }, { values, conditions })
  }, [values, conditions, prevValues])

  const assignedPlayers = new Set(Object.values(lineup).filter(Boolean) as string[])

  // Auto-remove ineligible players from lineup
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

  const savePrev = useCallback(() => setPrevValues(values), [values])

  const toggleInjury = useCallback((id: string) => {
    savePrev()
    setInjuries(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [savePrev])

  const togglePitcher = useCallback(() => {
    savePrev()
    setOpposingPitcher(p => p === 'L' ? 'R' : 'L')
  }, [savePrev])

  const toggleRest = useCallback(() => {
    savePrev()
    setMorrisonRested(r => !r)
  }, [savePrev])

  const assignPlayer = useCallback((slot: string, playerId: string) => {
    setLineup(prev => ({ ...prev, [slot]: playerId }))
    setSelectingSlot(null)
  }, [])

  const clearSlot = useCallback((slot: string) => {
    setLineup(prev => ({ ...prev, [slot]: null }))
  }, [])

  const getEligibleForSlot = (slot: LineupSlot) =>
    Object.entries(roster).filter(([id, player]) => {
      if (!availability[id]?.enabled) return false
      if (assignedPlayers.has(id) && lineup[slot.label] !== id) return false
      if (slot.position === 'DH') return player.role === 'position'
      return player.positions.includes(slot.position)
    })

  // --- Render helpers ---

  const pitcherVariant = opposingPitcher === 'L' ? 'green' : 'yellow'
  const restVariant = morrisonRested ? 'green' : 'red'

  function playerState(id: string) {
    const enabled = availability[id]?.enabled ?? true
    if (!enabled) return 'disabled'
    if (assignedPlayers.has(id)) return 'assigned'
    return 'available'
  }

  function dotVariant(id: string) {
    const state = playerState(id)
    if (state === 'disabled') return 'red'
    if (state === 'assigned') return 'dim'
    return 'green'
  }

  return (
    <div className="lineup">
      {/* Controls */}
      <div className="lineup__controls">
        <button
          className={cls('lineup__toggle', `lineup__toggle--${pitcherVariant}`)}
          onClick={togglePitcher}
        >
          Opposing: {opposingPitcher === 'L' ? 'LHP' : 'RHP'}
        </button>
        <button
          className={cls('lineup__toggle', `lineup__toggle--${restVariant}`)}
          onClick={toggleRest}
        >
          Morrison: {morrisonRested ? 'rested' : 'fatigued'}
        </button>
      </div>

      {/* Penalties */}
      {penalties.length > 0 && (
        <div className="lineup__penalties">
          <div className="lineup__penalties-title">🚩 Flag on the play</div>
          {penalties.map((p, i) => (
            <div key={i} className="lineup__penalty">
              <strong>{roster[p.field]?.name ?? p.field}</strong>
              <span className="lineup__penalty-reason"> — {p.reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Panels */}
      <div className="lineup__panels">
        {/* Roster */}
        <div className="lineup__panel lineup__panel--roster">
          <div className="lineup__panel-header lineup__panel-header--roster">
            <span>Roster</span>
            <span className="lineup__panel-accent--green">Boston Crabs</span>
          </div>
          <div className="lineup__panel-body">
            {Object.entries(roster).map(([id, player]) => {
              const state = playerState(id)
              const av = availability[id]
              return (
                <div key={id} className={cls('lineup__player', `lineup__player--${state}`)}>
                  <span className={cls('lineup__dot', `lineup__dot--${dotVariant(id)}`)} />
                  <span className={cls(
                    'lineup__player-name',
                    state === 'disabled' ? 'lineup__player-name--inactive' : 'lineup__player-name--active',
                    state === 'assigned' && 'lineup__player-name--struck',
                  )}>
                    {player.name}
                  </span>
                  <span className="lineup__player-pos">{player.positions.join('/')}</span>
                  <span className="lineup__player-bt">{player.bats}/{player.throws}</span>
                  {state === 'disabled' && (
                    <span className="lineup__badge lineup__badge--out">{av?.reason ?? 'out'}</span>
                  )}
                  {state === 'assigned' && (
                    <span className="lineup__badge lineup__badge--in">in lineup</span>
                  )}
                  <button
                    className={cls(
                      'lineup__injury-btn',
                      injuries.has(id) ? 'lineup__injury-btn--injured' : 'lineup__injury-btn--clear',
                    )}
                    onClick={() => toggleInjury(id)}
                    title={injuries.has(id) ? 'Clear injury' : 'Add to IL'}
                  >
                    {injuries.has(id) ? '✕' : '🤕'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Lineup Card */}
        <div className="lineup__panel lineup__panel--card">
          <div className="lineup__panel-header lineup__panel-header--card">
            <span>Tonight's Lineup</span>
            <span className="lineup__panel-accent--yellow">
              vs {opposingPitcher === 'L' ? 'LHP' : 'RHP'}
            </span>
          </div>
          <div className="lineup__panel-body">
            {lineupSlots.map((slot) => {
              const playerId = lineup[slot.label]
              const player = playerId ? roster[playerId] : null
              const eligible = getEligibleForSlot(slot)
              const isSelecting = selectingSlot === slot.label
              const isSP = slot.position === 'SP'

              return (
                <div key={slot.label} className={cls('lineup__slot', isSP && 'lineup__slot--sp')}>
                  <div
                    className={cls('lineup__slot-row', isSelecting && 'lineup__slot-row--selecting')}
                    onClick={() => playerId ? clearSlot(slot.label) : setSelectingSlot(isSelecting ? null : slot.label)}
                  >
                    <span className={cls('lineup__slot-order', isSP && 'lineup__slot-order--sp')}>
                      {slot.label}
                    </span>
                    <span className="lineup__slot-pos">{slot.position}</span>
                    {player ? (
                      <>
                        <span className="lineup__slot-name">{player.name}</span>
                        <span className="lineup__slot-bt">{player.bats}/{player.throws}</span>
                        <span className="lineup__slot-remove" title="Remove from lineup">✕</span>
                      </>
                    ) : (
                      <span className={cls(
                        'lineup__slot-empty',
                        eligible.length === 0 && 'lineup__slot-empty--none',
                      )}>
                        {eligible.length > 0 ? `${eligible.length} eligible` : 'no eligible players'}
                      </span>
                    )}
                  </div>

                  {isSelecting && eligible.length > 0 && (
                    <div className="lineup__eligible">
                      {eligible.map(([id, p]) => (
                        <div
                          key={id}
                          className="lineup__eligible-option"
                          onClick={(e) => { e.stopPropagation(); assignPlayer(slot.label, id) }}
                        >
                          <span className="lineup__eligible-dot" />
                          <span className="lineup__eligible-name">{p.name}</span>
                          <span className="lineup__eligible-bt">{p.bats}/{p.throws}</span>
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
