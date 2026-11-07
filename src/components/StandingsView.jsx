import { Fragment, useMemo } from 'react'
import { rankTable, playoffFormat, TIEBREAK_LABELS } from '../utils/standings.js'
import { useFollow } from '../context/follow.jsx'
import { netClass, signed } from '../utils/format.js'
import TeamLogo from './TeamLogo.jsx'

const pct = (n) => n.toFixed(3).replace(/^0/, '')
const gbText = (n) => (n === 0 ? '—' : n % 1 ? n.toFixed(1) : String(n))

function StreakPill({ streak }) {
  if (!streak) return <span className="dim">—</span>
  const win = streak > 0
  return (
    <span className={`streak ${win ? 'streak-w' : 'streak-l'}`}>
      {win ? 'W' : 'L'}
      {Math.abs(streak)}
    </span>
  )
}

// Five dots, oldest first: faster to read than "3-2" when scanning for who is hot.
function LastFive({ results }) {
  const w = results.filter((r) => r === 'W').length
  return (
    <span className="l10" title={`${w}-${results.length - w} in the last ${results.length}`}>
      {results.map((r, i) => (
        <i key={i} className={r === 'W' ? 'l10-w' : 'l10-l'} />
      ))}
    </span>
  )
}

function Row({ row, onPick, year }) {
  const { isFollowed, toggle } = useFollow()
  const followed = isFollowed(row.abbr)
  return (
    <tr className={`${followed ? 'row-followed' : ''} ${row.eliminated ? 'row-elim' : ''}`}>
      <td className="col-rank">
        <button
          className={`star ${followed ? 'on' : ''}`}
          onClick={() => toggle(row.abbr)}
          aria-label={`${followed ? 'Unfollow' : 'Follow'} ${row.team.name}`}
          aria-pressed={followed}
        >
          ★
        </button>
        <span className="rank">{row.seed}</span>
      </td>
      <td className="col-team">
        <button className="team-btn" onClick={() => onPick?.(row.abbr, year)}>
          <TeamLogo abbr={row.abbr} size={26} />
          <span className="team-name">
            <span className="team-nick">{row.team.name}</span>
          </span>
          {row.clinched && (
            <span className="badge badge-in" title="Clinched a playoff spot">
              ✓
            </span>
          )}
          {row.eliminated && (
            <span className="badge badge-out" title="Eliminated from playoff contention">
              ✕
            </span>
          )}
          {row.tiebreak && (
            <span className="tb-mark" title={`Placed by ${TIEBREAK_LABELS[row.tiebreak]}`}>
              {row.tiebreak === 'coin' ? '?' : '*'}
            </span>
          )}
        </button>
      </td>
      <td className="num">{row.w}</td>
      <td className="num">{row.l}</td>
      <td className="num">{pct(row.pct)}</td>
      <td className="num dim">{gbText(row.gb)}</td>
      <td className="num hide-sm">{row.pf}</td>
      <td className="num hide-sm">{row.pa}</td>
      <td className="hide-sm">
        <LastFive results={row.last5} />
      </td>
      <td className="num">
        <StreakPill streak={row.streak} />
      </td>
      <td className={`num ${netClass(row.netPpg)}`}>{signed(row.netPpg)}</td>
    </tr>
  )
}

// The table alone, without the view heading: the History tab renders it for an archived
// season.
export function StandingsTable({ season, onPick }) {
  const { year, games, clubs } = season
  const rows = useMemo(() => rankTable(games, { year, clubs }), [games, year, clubs])
  const { spots, byes } = playoffFormat(year)
  const played = rows.some((r) => r.gp > 0)
  const forfeits = games.filter((g) => g.forfeit)
  return (
    <div className="card">
      <h3 className="card-title">
        {year} regular season
        {!played && <span className="dim"> · no games played yet</span>}
      </h3>
      <div className="table-scroll">
        <table className="standings">
          <thead>
            <tr>
              <th className="col-rank" />
              <th className="col-team">Club</th>
              <th className="num">W</th>
              <th className="num">L</th>
              <th className="num">PCT</th>
              <th className="num">GB</th>
              <th className="num hide-sm" title="Points for">PF</th>
              <th className="num hide-sm" title="Points against">PA</th>
              <th className="hide-sm">Last 5</th>
              <th className="num">Strk</th>
              <th className="num" title="Point differential per game">
                Net
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <Fragment key={row.abbr}>
                <Row row={row} onPick={onPick} year={season.current ? null : year} />
                {i + 1 === spots && i + 1 < rows.length && (
                  <tr className="cutline">
                    <td colSpan={11}>
                      <span>
                        Playoff line: the top {spots} qualify
                        {byes < spots ? `, and the top ${byes} skip the first round` : ''}
                      </span>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="legend">
        <span className="legend-item">
          <span className="badge badge-in">✓</span> clinched a playoff spot
        </span>
        <span className="legend-item">
          <span className="badge badge-out">✕</span> eliminated
        </span>
        <span className="legend-item">
          <span className="tb-mark">*</span> placed by a tiebreaker: head-to-head, then record vs.
          playoff clubs, then point differential (hover for which)
        </span>
        {rows.some((r) => r.tiebreak === 'coin') && (
          <span className="legend-item">
            <span className="tb-mark">?</span> still level after every step; the league breaks this
            with a coin flip, so the order shown is alphabetical
          </span>
        )}
        {forfeits.map((g) => (
          <span className="legend-item" key={g.id}>
            Includes a forfeit: {g.note}. It counts as a win and a loss but adds no points.
          </span>
        ))}
      </p>
    </div>
  )
}

export default function StandingsView({ season, onPick }) {
  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Standings</h2>
          <p className="sub">
            Fourteen regular-season games per club. Seeds follow win percentage, then
            head-to-head, record against playoff clubs, and point differential.
          </p>
        </div>
      </div>
      <StandingsTable season={season} onPick={onPick} />
    </section>
  )
}
