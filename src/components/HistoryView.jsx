import { useMemo } from 'react'
import { HISTORY } from '../data/history.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { rankTable } from '../utils/standings.js'
import { formatDate } from '../utils/time.js'
import { StandingsTable } from './StandingsView.jsx'
import { BracketBody, formatNote } from './Bracket.jsx'
import { StatsBody } from './StatsView.jsx'
import TeamLogo from './TeamLogo.jsx'

function Club({ abbr, onPick, year }) {
  return (
    <button className="hy-team" onClick={() => onPick?.(abbr, year)}>
      <TeamLogo abbr={abbr} size={22} />
      <span>{TEAM_BY_ABBR[abbr].name}</span>
    </button>
  )
}

// One row per completed season: champion, its seed, the runner-up, and the final score.
function Champions({ onPick, onSeason, onOpen, tz }) {
  return (
    <div className="card">
      <h3 className="card-title">Champions</h3>
      <div className="table-scroll">
        <table className="standings hy-table">
          <thead>
            <tr>
              <th className="col-rank">Year</th>
              <th className="col-team">Champion</th>
              <th className="num">Seed</th>
              <th className="col-team">Runner-up</th>
              <th className="num">Final</th>
            </tr>
          </thead>
          <tbody>
            {HISTORY.map((s) => {
              const seeds = Object.fromEntries(
                rankTable(s.games, { year: s.year, clubs: s.clubs }).map((r) => [r.abbr, r.seed])
              )
              const final = s.games.find((g) => g.round === 'Final')
              const [h, a] = final.score
              return (
                <tr key={s.year}>
                  <td className="col-rank">
                    <button className="hy-year" onClick={() => onSeason(s.year)}>
                      {s.year}
                    </button>
                  </td>
                  <td className="col-team">
                    <Club abbr={s.champion} onPick={onPick} year={s.year} />
                  </td>
                  <td className="num">{seeds[s.champion]}</td>
                  <td className="col-team">
                    <Club abbr={s.runnerUp} onPick={onPick} year={s.year} />
                  </td>
                  <td className="num">
                    <button className="drill-score" onClick={() => onOpen?.(final)} title={formatDate(final.tip, tz, { year: 'numeric' })}>
                      {Math.max(h, a)}–{Math.min(h, a)}
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

// Completed seasons, one at a time, through the same standings, bracket and leaders the
// current season uses. Results are shown here whatever the spoiler setting: these
// seasons are over, and a history page with its results hidden has nothing to say.
export default function HistoryView({ season, onSeason, tz, onPick, onPickPlayer, onOpen }) {
  const chosen = useMemo(
    () => HISTORY.find((s) => s.year === season) || HISTORY[0],
    [season]
  )
  const shown = useMemo(() => ({ ...chosen, current: false }), [chosen])
  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>History</h2>
          <p className="sub">Every completed Unrivaled season, from the league&apos;s first in 2025.</p>
        </div>
        <div className="seg" role="tablist" aria-label="Season">
          {HISTORY.map((s) => (
            <button
              key={s.year}
              role="tab"
              aria-selected={s.year === chosen.year}
              className={s.year === chosen.year ? 'on' : ''}
              onClick={() => onSeason(s.year)}
            >
              {s.year}
            </button>
          ))}
        </div>
      </div>

      <Champions onPick={onPick} onSeason={onSeason} onOpen={onOpen} tz={tz} />

      <h3 className="hy-season">{chosen.year} season</h3>
      <StandingsTable season={shown} onPick={onPick} />
      <div className="card">
        <h3 className="card-title">{chosen.year} playoffs</h3>
        <p className="sub">{formatNote(chosen.year)}</p>
        <BracketBody
          season={shown}
          tz={tz}
          onPick={(abbr) => onPick?.(abbr, chosen.year)}
          onOpen={onOpen}
        />
      </div>
      <StatsBody
        season={shown}
        onPickPlayer={onPickPlayer}
        onPickTeam={(abbr) => onPick?.(abbr, chosen.year)}
      />
    </section>
  )
}
