import { useState, useMemo, useCallback } from 'react'
import { umpire, createRules } from '@umpire/core'
import { useUmpire } from '@umpire/react'
import type { FieldDef } from '@umpire/core'

// ─── Roster data ───────────────────────────────────────────────────────────────
// A baseball roster. Each player has positions they can field, handedness, and a
// role (position player, starting pitcher, or reliever). This is static data —
// Umpire doesn't care where it comes from.

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

const playerIds = Object.keys(roster)
const rosterEntries = Object.entries(roster)

// ─── Lineup slots ──────────────────────────────────────────────────────────────
// Tonight's card: starting pitcher + 9 batting order slots, each needing a
// specific defensive position.

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

// ─── Umpire setup ──────────────────────────────────────────────────────────────
//
// One field per player. All the factors that affect eligibility — pitcher
// handedness, injuries, rest status — are *conditions*: external facts that
// affect availability but aren't form fields the user fills in. Conditions go
// in the second argument to check() and play().

const fields = Object.fromEntries(
  playerIds.map(id => [id, {}]),
)

type Conditions = {
  opposingPitcher: 'L' | 'R'
  injuries: Record<string, boolean>
  morrisonRested: boolean
}

const { enabledWhen, oneOf } = createRules<typeof fields, Conditions>()

const lineupUmp = umpire<typeof fields, Conditions>({
  fields,
  rules: [
    // ── oneOf: platoon matchups ─────────────────────────────────────────────
    // oneOf() creates mutually exclusive branches. Only the active branch's
    // fields are enabled; the rest are disabled. Here, the opposing pitcher's
    // handedness determines which batter starts at 1B and LF.

    oneOf('firstBasePlatoon', {
      vsRighty: ['delgado'],   // Delgado (bats L) starts against right-handed pitchers
      vsLefty:  ['vega'],      // Vega (bats R) starts against left-handed pitchers
    }, {
      activeBranch: (_v, c) => c.opposingPitcher === 'L' ? 'vsLefty' : 'vsRighty',
      reason: 'platoon matchup',
    }),

    oneOf('leftFieldPlatoon', {
      vsRighty: ['reyes'],     // Reyes (bats L) vs righties
      vsLefty:  ['patterson'], // Patterson (bats R) vs lefties
    }, {
      activeBranch: (_v, c) => c.opposingPitcher === 'L' ? 'vsLefty' : 'vsRighty',
      reason: 'platoon matchup',
    }),

    // ── enabledWhen: conditional availability ───────────────────────────────
    // enabledWhen() disables a field when the predicate returns false. Each
    // rule can read field values and conditions.

    // Silva (bats L) sits against left-handed pitching — bad matchup.
    enabledWhen('silva', (_v, c) => c.opposingPitcher !== 'L', {
      reason: 'platoon — lefty sits vs LHP',
    }),

    // Injured players are scratched from the roster entirely.
    ...playerIds.map(id =>
      enabledWhen(id, (_v, c) => !c.injuries[id], {
        reason: 'on the injured list',
      })
    ),

    // Morrison can't pitch without rest.
    enabledWhen('morrison', (_v, c) => c.morrisonRested, {
      reason: 'needs rest',
    }),
  ],
})

// ─── Helpers ───────────────────────────────────────────────────────────────────

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function LineupCard() {
  // --- User-controlled state ---
  const [opposingPitcher, setOpposingPitcher] = useState<'L' | 'R'>('R')
  const [injuries, setInjuries] = useState<Record<string, boolean>>({})
  const [morrisonRested, setMorrisonRested] = useState(true)
  const [selectingSlot, setSelectingSlot] = useState<string | null>(null)
  const [lineup, setLineup] = useState<Record<string, string | null>>({
    'SP': 'morrison',   // Starting pitcher — rested and ready (try toggling fatigue)
    '1':  'chen',       // C
    '2':  'russo',      // 2B
    '3':  'nakamura',   // SS
    '4':  'delgado',    // 1B (platoon vs RHP — try flipping the pitcher)
    '5':  'kowalski',   // 3B
    '6':  'reyes',      // LF (platoon vs RHP)
    '7':  'summer',     // CF
    '8':  'williams',   // RF
    '9':  'silva',      // DH
  })

  // --- Build the inputs to Umpire ---
  //
  // Values: only players assigned to lineup slots get truthy values. This is
  // what makes play() work correctly — it detects fields that "had a value but
  // just became disabled." Bench players have no values, so they never produce fouls.
  //
  // Conditions: external facts — pitcher handedness, injuries, rest status.

  const values = useMemo(() => {
    const inLineup = Object.values(lineup).filter(Boolean) as string[]
    return Object.fromEntries(inLineup.map(id => [id, id]))
  }, [lineup])

  const conditions: Conditions = useMemo(
    () => ({ opposingPitcher, injuries, morrisonRested }),
    [opposingPitcher, injuries, morrisonRested],
  )

  // --- useUmpire: availability + fouls in one call ---
  //
  // useUmpire() handles check() and play() internally, including snapshot
  // tracking for foul detection. No manual useRef, no saveSnapshot()
  // before every toggle. Pass values + conditions, get results.

  const { check: availability, fouls } = useUmpire(lineupUmp, values, conditions)

  // --- Derived: effective lineup ---
  //
  // Instead of mutating lineup state when a player becomes ineligible, we
  // derive the effective lineup during render. Slots with ineligible players
  // show as empty. If a player becomes eligible again (e.g., un-injured),
  // they reappear in their slot — availability is derived, not destructive.

  const effectiveLineup = useMemo(() => {
    const result: Record<string, string | null> = {}
    for (const [slot, playerId] of Object.entries(lineup)) {
      result[slot] = playerId && availability[playerId]?.enabled ? playerId : null
    }
    return result
  }, [lineup, availability])

  const assignedPlayers = useMemo(
    () => new Set(Object.values(effectiveLineup).filter(Boolean) as string[]),
    [effectiveLineup],
  )

  // --- Event handlers ---
  // No saveSnapshot() needed — useUmpire tracks snapshots internally.

  const toggleInjury = useCallback((id: string) => {
    setInjuries(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const togglePitcher = useCallback(() => {
    setOpposingPitcher(p => p === 'L' ? 'R' : 'L')
  }, [])

  const toggleRest = useCallback(() => {
    setMorrisonRested(r => !r)
  }, [])

  const resetAll = useCallback(() => {
    setOpposingPitcher('R')
    setMorrisonRested(true)
    setInjuries({})
    setSelectingSlot(null)
    setLineup({
      'SP': 'morrison',
      '1':  'chen',
      '2':  'russo',
      '3':  'nakamura',
      '4':  'delgado',
      '5':  'kowalski',
      '6':  'reyes',
      '7':  'summer',
      '8':  'williams',
      '9':  'silva',
    })
  }, [])

  const clearAll = useCallback(() => {
    setOpposingPitcher('R')
    setMorrisonRested(true)
    setInjuries({})
    setSelectingSlot(null)
    const slots: Record<string, string | null> = {}
    for (const slot of lineupSlots) slots[slot.label] = null
    setLineup(slots)
  }, [])

  const randomInjury = useCallback(() => {
    // Pick a random player who is currently healthy and in the lineup
    const inLineup = Object.values(lineup).filter(Boolean) as string[]
    const healthy = inLineup.filter(id => !injuries[id])
    if (healthy.length === 0) return
    const victim = healthy[Math.floor(Math.random() * healthy.length)]
    setInjuries(prev => ({ ...prev, [victim]: true }))
  }, [lineup, injuries])

  const assignPlayer = useCallback((slot: string, playerId: string) => {
    setLineup(prev => ({ ...prev, [slot]: playerId }))
    setSelectingSlot(null)
  }, [])

  const clearSlot = useCallback((slot: string) => {
    setLineup(prev => ({ ...prev, [slot]: null }))
  }, [])

  // Which players can fill a given slot? Must be eligible, not already assigned
  // elsewhere, and able to play the position.
  const getEligibleForSlot = (slot: LineupSlot) =>
    rosterEntries.filter(([id, player]) => {
      if (!availability[id]?.enabled) return false
      if (assignedPlayers.has(id) && effectiveLineup[slot.label] !== id) return false
      if (slot.position === 'DH') return player.role === 'position'
      return player.positions.includes(slot.position)
    })

  // --- Render helpers ---

  function playerState(id: string): 'disabled' | 'assigned' | 'available' {
    if (!availability[id]?.enabled) return 'disabled'
    if (assignedPlayers.has(id)) return 'assigned'
    return 'available'
  }

  function dotVariant(id: string) {
    const state = playerState(id)
    if (state === 'disabled') return 'red'
    if (state === 'assigned') return 'dim'
    return 'green'
  }

  const pitcherVariant = opposingPitcher === 'L' ? 'green' : 'yellow'
  const restVariant = morrisonRested ? 'green' : 'red'

  // --- Render ---

  return (
    <div className="c-lineup">
      {/* Toggle buttons — change conditions, watch availability react */}
      <div className="c-lineup__controls">
        <button
          className={cls('c-lineup__toggle', `c-lineup__toggle--${pitcherVariant}`)}
          onClick={togglePitcher}
        >
          Opposing: {opposingPitcher === 'L' ? 'LHP' : 'RHP'}
        </button>
        <button
          className={cls('c-lineup__toggle', `c-lineup__toggle--${restVariant}`)}
          onClick={toggleRest}
        >
          Morrison: {morrisonRested ? 'rested' : 'fatigued'}
        </button>
        <button
          className="c-lineup__toggle c-lineup__toggle--red"
          onClick={randomInjury}
        >
          🤕 Random injury
        </button>
        <span style={{ flex: 1 }} />
        <button
          className="c-lineup__toggle c-lineup__toggle--dim"
          onClick={clearAll}
        >
          Clear
        </button>
        <button
          className="c-lineup__toggle c-lineup__toggle--dim"
          onClick={resetAll}
        >
          Reset
        </button>
      </div>

      {/* Foul flags — useUmpire detected fields that just became ineligible */}
      {fouls.length > 0 && (
        <div className="c-lineup__fouls">
          <div className="c-lineup__fouls-title">🚩 Fouls</div>
          {fouls.map((p, i) => (
            <div key={i} className="c-lineup__foul">
              <strong>{roster[p.field]?.name ?? p.field}</strong>
              <span className="c-lineup__foul-reason"> — {p.reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Two-panel layout: roster on left, tonight's card on right */}
      <div className="c-lineup__panels">
        {/* Left: full roster with availability indicators */}
        <div className="c-lineup__panel c-lineup__panel--roster">
          <div className="c-lineup__panel-header c-lineup__panel-header--roster">
            <span>Roster</span>
            <span className="c-lineup__panel-accent--green">Boston Crabs</span>
          </div>
          <div className="c-lineup__panel-body">
            {rosterEntries.map(([id, player]) => {
              const state = playerState(id)
              const av = availability[id]
              return (
                <div key={id} className={cls('c-lineup__player', `c-lineup__player--${state}`)}>
                  <span className={cls('c-lineup__dot', `c-lineup__dot--${dotVariant(id)}`)} />
                  <span className={cls(
                    'c-lineup__player-name',
                    state === 'disabled' ? 'c-lineup__player-name is-inactive' : 'c-lineup__player-name is-active',
                    state === 'assigned' && 'c-lineup__player-name is-struck',
                  )}>
                    {player.name}
                  </span>
                  <span className="c-lineup__player-pos">{player.positions.join('/')}</span>
                  <span className="c-lineup__player-bt">{player.bats}/{player.throws}</span>
                  {state === 'disabled' && (
                    <span className="c-lineup__badge c-lineup__badge--out">{av?.reason ?? 'out'}</span>
                  )}
                  {state === 'assigned' && (
                    <span className="c-lineup__badge c-lineup__badge--in">in lineup</span>
                  )}
                  <button
                    className={cls(
                      'c-lineup__injury-btn',
                      injuries[id] ? 'c-lineup__injury-btn is-injured' : 'c-lineup__injury-btn--clear',
                    )}
                    onClick={() => toggleInjury(id)}
                    title={injuries[id] ? 'Clear injury' : 'Add to IL'}
                  >
                    {injuries[id] ? '✕' : '🤕'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: tonight's lineup card — click slots to assign eligible players */}
        <div className="c-lineup__panel c-lineup__panel--card">
          <div className="c-lineup__panel-header c-lineup__panel-header--card">
            <span>Tonight's Lineup</span>
            <span className="c-lineup__panel-accent--yellow">
              vs {opposingPitcher === 'L' ? 'LHP' : 'RHP'}
            </span>
          </div>
          <div className="c-lineup__panel-body">
            {lineupSlots.map((slot) => {
              const playerId = effectiveLineup[slot.label]
              const player = playerId ? roster[playerId] : null
              const eligible = getEligibleForSlot(slot)
              const isSelecting = selectingSlot === slot.label
              const isSP = slot.position === 'SP'

              return (
                <div key={slot.label} className={cls('c-lineup__slot', isSP && 'c-lineup__slot--sp')}>
                  <div
                    className={cls('c-lineup__slot-row', isSelecting && 'c-lineup__slot-row is-selecting')}
                    onClick={() => playerId ? clearSlot(slot.label) : setSelectingSlot(isSelecting ? null : slot.label)}
                  >
                    <span className={cls('c-lineup__slot-order', isSP && 'c-lineup__slot-order--sp')}>
                      {slot.label}
                    </span>
                    <span className="c-lineup__slot-pos">{slot.position}</span>
                    {player ? (
                      <>
                        <span className="c-lineup__slot-name">{player.name}</span>
                        <span className="c-lineup__slot-bt">{player.bats}/{player.throws}</span>
                        <span className="c-lineup__slot-remove" title="Remove from lineup">✕</span>
                      </>
                    ) : (
                      <span className={cls(
                        'c-lineup__slot-empty',
                        eligible.length === 0 && 'c-lineup__slot-empty--none',
                      )}>
                        {eligible.length > 0 ? `${eligible.length} eligible` : 'no eligible players'}
                      </span>
                    )}
                  </div>

                  {isSelecting && eligible.length > 0 && (
                    <div className="c-lineup__eligible">
                      {eligible.map(([id, p]) => (
                        <div
                          key={id}
                          className="c-lineup__eligible-option"
                          onClick={(e) => { e.stopPropagation(); assignPlayer(slot.label, id) }}
                        >
                          <span className="c-lineup__eligible-dot" />
                          <span className="c-lineup__eligible-name">{p.name}</span>
                          <span className="c-lineup__eligible-bt">{p.bats}/{p.throws}</span>
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
