import { useMemo, useState } from 'react'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { SEASONS } from '../utils/seasons.js'
import { playerSeasons } from '../utils/stats.js'
import { formatDate } from '../utils/time.js'
import { useModalA11y } from '../hooks/useModalA11y.js'
import { useBox } from '../hooks/useBox.js'
import TeamLogo from './TeamLogo.jsx'

const one = (n) => n.toFixed(1)
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

// One player across every season the app holds: a line per season (regular season and
// playoffs together, as the league's own player pages count them), then that season's
// game log. Everything comes from the committed box scores; there is no player feed.
export default function PlayerModal({ player, tz, hideScores, onClose, onOpenGame }) {
  const ref = useModalA11y(onClose, !!player)
  const box = useBox()
  const [year, setYear] = useState(null)
  const id = player?.id

  const bySeason = useMemo(() => {
    if (!id || !box) return []
    return SEASONS.map((s) => ({ season: s, line: playerSeasons(s.games, box).find((p) => p.id === id) })).filter(
      (x) => x.line
    )
  }, [id, box])

  if (!player) return null
  const shown = bySeason.find((x) => x.season.year === year) || bySeason[0]
  // Spoiler-free mode hides the current season's numbers, which give results away.
  const hidden = (s) => hideScores && s.current

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={player.name} ref={ref} tabIndex={-1}>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="pm-head">
          {shown && <TeamLogo abbr={shown.line.club} size={48} />}
          <div>
            <h3 className="pm-name">{player.name}</h3>
            <p className="pm-sub">
              {shown ? `${TEAM_BY_ABBR[shown.line.club].name} · ` : ''}
              <a href={`https://www.unrivaled.basketball/player/${player.id}`} target="_blank" rel="noopener noreferrer">
                Player page ↗
              </a>
            </p>
          </div>
        </div>

        {!box && <p className="dim">Loading box scores…</p>}
        {box && !shown && <p className="empty">No games played in the seasons this app holds.</p>}

        {shown && (
          <>
            <h4 className="md-sub">By season</h4>
            <div className="table-scroll">
              <table className="standings">
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>Club</th>
                    <th className="num">GP</th>
                    <th className="num">PTS</th>
                    <th className="num">REB</th>
                    <th className="num">AST</th>
                    <th className="num hide-sm">FG%</th>
                    <th className="num hide-sm">3P%</th>
                  </tr>
                </thead>
                <tbody>
                  {bySeason.map(({ season, line }) => (
                    <tr key={season.year} className={season.year === shown.season.year ? 'row-followed' : ''}>
                      <td>
                        <button className="hy-year" onClick={() => setYear(season.year)}>
                          {season.year}
                        </button>
                      </td>
                      <td>
                        {line.clubs.map((c) => (
                          <TeamLogo key={c} abbr={c} size={18} />
                        ))}
                      </td>
                      {hidden(season) ? (
                        <td colSpan={6} className="dim">
                          Hidden in spoiler-free mode
                        </td>
                      ) : (
                        <>
                          <td className="num">{line.gp}</td>
                          <td className="num">{one(line.ppg)}</td>
                          <td className="num">{one(line.rpg)}</td>
                          <td className="num">{one(line.apg)}</td>
                          <td className="num hide-sm">{pct(line.fgPct)}</td>
                          <td className="num hide-sm">{pct(line.tpPct)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!hidden(shown.season) && (
              <>
                <h4 className="md-sub">{shown.season.year} game log</h4>
                <ul className="drill pm-log">
                  {shown.line.log.map(({ game, club, line }) => {
                    const opp = game.home === club ? game.away : game.home
                    return (
                      <li key={game.id}>
                        <button className="drill-row" onClick={() => onOpenGame?.(game)}>
                          <span className="drill-date">{formatDate(game.tip, tz)}</span>
                          <span className="dim">{game.home === club ? 'vs' : '@'}</span>
                          <TeamLogo abbr={opp} size={16} />
                          <span className="drill-team">{TEAM_BY_ABBR[opp].name}</span>
                          <span className="drill-score">
                            {line.pts} PTS · {line.reb} REB · {line.ast} AST
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
