import { useMemo } from 'react'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { rankTable, resultOf } from '../utils/standings.js'
import { ROUND_LABELS } from '../utils/bracket.js'
import { playerSeasons } from '../utils/stats.js'
import { SEASONS } from '../utils/seasons.js'
import { formatDate, gameTime } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import { useModalA11y } from '../hooks/useModalA11y.js'
import { useBox } from '../hooks/useBox.js'
import { signed } from '../utils/format.js'
import TeamLogo from './TeamLogo.jsx'

const one = (n) => n.toFixed(1)

// A club in one season: its record and seed, every game, and who played for it. `season`
// is a season object from utils/seasons.js; the panel shows that season whichever tab
// opened it.
export default function TeamPanel({ abbr, season, tz, hideScores, onClose, onSchedule, onOpenGame, onPickPlayer }) {
  const ref = useModalA11y(onClose, !!abbr)
  const { isFollowed, toggle } = useFollow()
  const box = useBox()
  const hide = hideScores && season?.current
  const row = useMemo(
    () => (abbr ? rankTable(season.games, { year: season.year, clubs: season.clubs }).find((r) => r.abbr === abbr) : null),
    [abbr, season]
  )
  const games = useMemo(
    () => (abbr ? season.games.filter((g) => g.home === abbr || g.away === abbr) : []),
    [abbr, season]
  )
  const roster = useMemo(() => {
    if (!abbr || !box) return null
    // Only this club's side of each box score, so an opponent's players never appear
    // and a player's games count only those played for this club.
    const own = {}
    for (const g of games) if (box[g.id]) own[g.id] = { [abbr]: box[g.id][abbr] }
    return playerSeasons(games, own).sort((a, b) => b.ppg - a.ppg)
  }, [abbr, box, games])
  // Titles across every season the app holds.
  const titles = useMemo(
    () => SEASONS.filter((s) => s.champion === abbr).map((s) => s.year),
    [abbr]
  )

  if (!abbr) return null
  const team = TEAM_BY_ABBR[abbr]
  const followed = isFollowed(abbr)

  const line = (g) => {
    const opp = g.home === abbr ? g.away : g.home
    const at = g.home === abbr ? 'vs' : '@'
    const stage = g.seasonType === 'playoffs' ? ROUND_LABELS[g.round] : null
    let result = gameTime(g, tz)
    if (g.forfeit) result = g.forfeit === abbr ? 'W (forfeit)' : 'L (forfeit)'
    else if (g.score)
      result = hide
        ? 'Final'
        : `${resultOf(g).winner === abbr ? 'W' : 'L'} ${Math.max(...g.score)}–${Math.min(...g.score)}`
    return { opp, at, stage, result }
  }

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={team.name} ref={ref} tabIndex={-1}>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="tp-head">
          <TeamLogo abbr={abbr} size={56} />
          <div>
            <h3 className="tp-name">{team.name}</h3>
            <p className="tp-sub">
              {season.year}: {hide ? 'record hidden' : `${row.w}–${row.l}, seed ${row.seed}`}
              {titles.length > 0 && <span> · 🏆 {titles.join(', ')}</span>}
            </p>
          </div>
          <button className={`chip ${followed ? 'on' : ''}`} onClick={() => toggle(abbr)} aria-pressed={followed}>
            {followed ? '★ Following' : '☆ Follow'}
          </button>
        </div>

        {!hide && (
          <div className="tp-stats">
            {[
              ['Record', `${row.w}–${row.l}`],
              ['Points for', row.pf],
              ['Points against', row.pa],
              ['Net per game', signed(row.netPpg)],
            ].map(([label, v]) => (
              <div className="tp-stat" key={label}>
                <span className="tp-stat-v">{v}</span>
                <span className="tp-stat-l">{label}</span>
              </div>
            ))}
          </div>
        )}

        {roster && roster.length > 0 && (
          <>
            <h4 className="md-sub">Players</h4>
            <div className="tp-roster">
              {roster.map((p) => (
                <div className="tp-player" key={p.id}>
                  <button className="lead-player tp-p-name" onClick={() => onPickPlayer?.(p)}>
                    {p.name}
                  </button>
                  <span className="tp-p-line">
                    {p.gp} GP · {one(p.ppg)} PTS · {one(p.rpg)} REB · {one(p.apg)} AST
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <h4 className="md-sub">{season.year} games</h4>
        <ul className="drill">
          {games.map((g) => {
            const l = line(g)
            return (
              <li key={g.id}>
                <button className="drill-row" onClick={() => onOpenGame?.(g)}>
                  <span className="drill-date">{formatDate(g.tip, tz)}</span>
                  <span className="dim">{l.at}</span>
                  <TeamLogo abbr={l.opp} size={18} />
                  <span className="drill-team">{TEAM_BY_ABBR[l.opp].name}</span>
                  {l.stage && <span className="drill-note">{l.stage}</span>}
                  <span className="drill-score">{l.result}</span>
                </button>
              </li>
            )
          })}
        </ul>

        {season.current && (
          <div className="md-actions">
            <button className="chip" onClick={() => (onSchedule?.(abbr), onClose())}>
              Filter the schedule to {team.name}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
