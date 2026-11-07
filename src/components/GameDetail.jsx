import { useEffect, useMemo, useState } from 'react'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { formatDate, formatZoneAbbr, liveState, gameTime, gameCountdown } from '../utils/time.js'
import { computeStandings, countsForStandings, resultOf } from '../utils/standings.js'
import { ROUND_LABELS } from '../utils/bracket.js'
import { seasonOfGame } from '../utils/seasons.js'
import { watchableServices, broadcastNotBadged } from '../utils/watch.js'
import { useServices } from '../context/services.jsx'
import { useModalA11y } from '../hooks/useModalA11y.js'
import { useBox } from '../hooks/useBox.js'
import TeamLogo from './TeamLogo.jsx'
import { LEAGUE } from '../config/league.js'

// The quarter breakdown. The fourth quarter is untimed and played to a target score,
// so its column is labeled for what it is.
function LineScore({ game }) {
  const { home, away } = game.line
  const n = Math.max(home.length, away.length)
  const sum = (arr) => arr.reduce((a, b) => a + b, 0)
  const label = (i) => (i === LEAGUE.regulationPeriods - 1 ? `${LEAGUE.periodShort}${i + 1} (to target)` : `${LEAGUE.periodShort}${i + 1}`)
  const Row = ({ abbr, vals, other }) => (
    <tr>
      <th scope="row">
        <TeamLogo abbr={abbr} size={18} />
        <span>{abbr}</span>
      </th>
      {Array.from({ length: n }, (_, i) => (
        <td key={i} className={vals[i] > other[i] ? 'q-won' : ''}>
          {vals[i]}
        </td>
      ))}
      <td className="q-total">{sum(vals)}</td>
    </tr>
  )
  return (
    <>
      <h4 className="md-sub">By {LEAGUE.periodNoun}</h4>
      <div className="table-scroll">
        <table className="linescore">
          <thead>
            <tr>
              <th />
              {Array.from({ length: n }, (_, i) => (
                <th key={i}>{label(i)}</th>
              ))}
              <th className="q-total">T</th>
            </tr>
          </thead>
          <tbody>
            <Row abbr={game.away} vals={away} other={home} />
            <Row abbr={game.home} vals={home} other={away} />
          </tbody>
        </table>
      </div>
    </>
  )
}

const COLS = [
  ['min', 'MIN', (v) => v.toFixed(1)],
  ['pts', 'PTS'],
  ['reb', 'REB'],
  ['ast', 'AST'],
  ['stl', 'STL'],
  ['blk', 'BLK'],
  ['to', 'TO'],
  ['fg', 'FG'],
  ['tp', '3PT'],
  ['ft', 'FT'],
  ['pm', '+/-', (v) => (v > 0 ? `+${v}` : String(v))],
]
const cell = (p, key, fmt) =>
  key === 'fg' ? `${p.fgm}-${p.fga}` : key === 'tp' ? `${p.tpm}-${p.tpa}` : key === 'ft' ? `${p.ftm}-${p.fta}` : fmt ? fmt(p[key]) : p[key]

function BoxTable({ abbr, lines, gap, onPickPlayer }) {
  return (
    <div className="box-team">
      <h5 className="bx-section-head">
        <TeamLogo abbr={abbr} size={18} /> {TEAM_BY_ABBR[abbr].name}
      </h5>
      <div className="table-scroll">
        <table className="boxscore">
          <thead>
            <tr>
              <th>Player</th>
              {COLS.map(([k, label]) => (
                <th key={k} className="num">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((p) => (
              <tr key={p.id} className={p.dnp ? 'dim' : ''}>
                <th scope="row">
                  <button className="lead-player" onClick={() => onPickPlayer?.({ id: p.id, name: p.name })}>
                    {p.name}
                  </button>
                  {p.starter && <span className="lead-pos"> S</span>}
                </th>
                {p.dnp ? (
                  <td colSpan={COLS.length} className="dim">
                    Did not play
                  </td>
                ) : (
                  COLS.map(([k, , fmt]) => (
                    <td key={k} className="num">
                      {cell(p, k, fmt)}
                    </td>
                  ))
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {gap > 0 && (
        <p className="fine">
          The league&apos;s box score leaves out {gap} of this club&apos;s points: a player who
          scored is missing from its table.
        </p>
      )}
    </div>
  )
}

function BoxScore({ game, onPickPlayer }) {
  const box = useBox()
  if (!box) return <p className="dim">Loading box score…</p>
  const b = box[game.id]
  if (!b) return <p className="dim">No box score for this game.</p>
  return (
    <section className="lineups">
      <h4 className="md-sub">Box score</h4>
      <div className="box-sides">
        {[game.away, game.home].map((abbr) => (
          <BoxTable key={abbr} abbr={abbr} lines={b[abbr]} gap={b.gaps?.[abbr] || 0} onPickPlayer={onPickPlayer} />
        ))}
      </div>
    </section>
  )
}

export default function GameDetail({ game, tz, hideScores, onClose, onPickTeam, onPickPlayer }) {
  const ref = useModalA11y(onClose, !!game)
  const { services } = useServices()
  const [revealed, setRevealed] = useState(false)
  const gameId = game?.id
  useEffect(() => setRevealed(false), [gameId])

  const season = useMemo(() => (game ? seasonOfGame(game) : null), [game])
  // Records going INTO this game, so an archived game shows the records it was played at.
  const records = useMemo(() => {
    if (!game) return {}
    const before = season.games.filter((g) => g.tip < game.tip)
    return Object.fromEntries(computeStandings(before).map((r) => [r.abbr, r]))
  }, [game, season])
  const series = useMemo(() => {
    if (!game) return []
    return season.games.filter(
      (g) => countsForStandings(g) && [g.home, g.away].includes(game.home) && [g.home, g.away].includes(game.away)
    )
  }, [game, season])

  if (!game) return null

  const away = TEAM_BY_ABBR[game.away]
  const home = TEAM_BY_ABBR[game.home]
  const state = liveState(game)
  const hide = hideScores && !revealed && season.current
  const scored = game.score && !hide
  const [hs, as] = game.score || []
  const watch = watchableServices(game.broadcast, services)
  const airedOn = broadcastNotBadged(game.broadcast, watch)
  const rec = (abbr) => records[abbr] && `${records[abbr].w}–${records[abbr].l}`
  const stage = game.seasonType === 'playoffs' ? ROUND_LABELS[game.round] : 'Regular season'

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal game-modal" role="dialog" aria-modal="true" aria-label="Game detail" ref={ref} tabIndex={-1}>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="md-head">
          <div className="md-side">
            <TeamLogo abbr={game.away} size={52} />
            <strong>{away.name}</strong>
            {rec(game.away) && <span className="dim">{rec(game.away)}</span>}
          </div>
          <div className="md-center">
            {state === 'void' ? (
              <span className="md-state">{game.canceled ? 'Canceled' : 'Postponed'}</span>
            ) : scored ? (
              <>
                <span className="md-score">
                  {as} – {hs}
                </span>
                <span className="md-state">Final</span>
              </>
            ) : game.score ? (
              <span className="md-state">Final</span>
            ) : (
              <>
                <span className="md-time">{gameTime(game, tz)}</span>
                <span className="md-state">{formatZoneAbbr(game.tip, tz)}</span>
                {gameCountdown(game) && <span className="md-state">in {gameCountdown(game)}</span>}
              </>
            )}
            {game.score && hideScores && season.current && (
              <button className="md-reveal" onClick={() => setRevealed((v) => !v)} aria-pressed={revealed}>
                {revealed ? 'Hide score' : 'Reveal score'}
              </button>
            )}
          </div>
          <div className="md-side">
            <TeamLogo abbr={game.home} size={52} />
            <strong>{home.name}</strong>
            {rec(game.home) && <span className="dim">{rec(game.home)}</span>}
          </div>
        </div>

        <dl className="md-facts">
          <div>
            <dt>Date</dt>
            <dd>{formatDate(game.tip, tz, { year: 'numeric' })}</dd>
          </div>
          <div>
            <dt>Stage</dt>
            <dd>
              {stage}, {season.year}
            </dd>
          </div>
          {game.venue && (
            <div>
              <dt>Venue</dt>
              <dd>{[game.venue, game.city, game.state].filter(Boolean).join(', ')}</dd>
            </div>
          )}
          {state === 'upcoming' && !game.broadcast?.length && (
            <div>
              <dt>Watch</dt>
              <dd>
                <span className="net-tba">Channel TBA</span>
              </dd>
            </div>
          )}
          {game.broadcast?.length > 0 && (
            <div>
              <dt>Watch</dt>
              <dd>
                {airedOn.join(' · ')}
                {watch.length > 0 && (
                  <span className="watch" aria-label={`Watch on ${watch.map((s) => s.label).join(', ')}`}>
                    <span className="watch-tv" aria-hidden="true">
                      📺
                    </span>
                    {watch.map((s) => (
                      <span key={s.key} className="watch-chip">
                        {s.label}
                      </span>
                    ))}
                  </span>
                )}
              </dd>
            </div>
          )}
          {game.note && (
            <div>
              <dt>Note</dt>
              <dd className="note">{game.note}</dd>
            </div>
          )}
        </dl>

        {game.score && !hide && (
          <div className="md-panel">
            <LineScore game={game} />
            <BoxScore game={game} onPickPlayer={onPickPlayer} />
          </div>
        )}

        {series.length > 0 && (
          <>
            <h4 className="md-sub">{season.year} meetings</h4>
            <ul className="drill">
              {series.map((g) => (
                <li key={g.id}>
                  <span className="drill-date">{formatDate(g.tip, tz)}</span>
                  <span className="dim">
                    {g.away} @ {g.home}
                  </span>
                  <span className="drill-score">
                    {g.forfeit ? `${g.forfeit} by forfeit` : hide ? '—' : `${g.score[1]} – ${g.score[0]}`}
                  </span>
                  {!hide && <span className="drill-note">{resultOf(g).winner}</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="md-actions">
          {!game.forfeit && (
            <a className="chip" href={`${LEAGUE.site}/game/${game.id}`} target="_blank" rel="noopener noreferrer">
              Game page on unrivaled.basketball ↗
            </a>
          )}
          {season.current && (
            <>
              <button className="chip" onClick={() => (onPickTeam?.(game.away), onClose())}>
                <TeamLogo abbr={game.away} size={16} /> {away.name} schedule
              </button>
              <button className="chip" onClick={() => (onPickTeam?.(game.home), onClose())}>
                <TeamLogo abbr={game.home} size={16} /> {home.name} schedule
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
