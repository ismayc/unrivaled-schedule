import { useMemo, useState } from 'react'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { useBox } from '../hooks/useBox.js'
import {
  playerSeasons,
  leaderboard,
  LEADER_CATEGORIES,
  formatStat,
  missingPoints,
  teamScoring,
} from '../utils/stats.js'
import { netClass, signed, barMax } from '../utils/format.js'
import TeamLogo from './TeamLogo.jsx'

const one = (n) => n.toFixed(1)

function Leaders({ players, onPickPlayer }) {
  const [key, setKey] = useState('ppg')
  const cat = LEADER_CATEGORIES.find((c) => c.key === key)
  const rows = leaderboard(players, key)
  const max = barMax(rows.map((p) => p[key]))
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Leaders: {cat.label}</h3>
        <div className="cats" role="tablist" aria-label="Leader categories">
          {LEADER_CATEGORIES.map((c) => (
            <button
              key={c.key}
              role="tab"
              aria-selected={c.key === key}
              className={`cat ${c.key === key ? 'on' : ''}`}
              onClick={() => setKey(c.key)}
            >
              {c.unit}
            </button>
          ))}
        </div>
      </div>
      <table className="leaders">
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.id}>
              <td className="lead-rank">{i + 1}</td>
              <td className="lead-team">
                <TeamLogo abbr={p.club} size={20} />
              </td>
              <td className="lead-name">
                <button className="lead-player" onClick={() => onPickPlayer?.(p)}>
                  {p.name}
                </button>
                <span className="lead-pos">{p.gp} GP</span>
              </td>
              <td className="lead-bar">
                <span className="bar" style={{ '--w': `${(Math.abs(p[key]) / max) * 100}%` }} />
              </td>
              <td className="lead-value">{formatStat(cat, p[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fine">
        Qualifying: half the most games anyone has played
        {cat.attempts ? `, and ${cat.perGame} attempts per game` : ''}.
      </p>
    </div>
  )
}

function TeamScoring({ games, onPickTeam }) {
  const rows = teamScoring(games)
  return (
    <div className="card">
      <h3 className="card-title">Club scoring</h3>
      <div className="table-scroll">
        <table className="standings">
          <thead>
            <tr>
              <th className="col-team">Club</th>
              <th className="num">GP</th>
              <th className="num">PPG</th>
              <th className="num">Opp PPG</th>
              <th className="num">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.abbr}>
                <td className="col-team">
                  <button className="team-btn" onClick={() => onPickTeam?.(r.abbr)}>
                    <TeamLogo abbr={r.abbr} size={22} />
                    <span className="team-nick">{TEAM_BY_ABBR[r.abbr].name}</span>
                  </button>
                </td>
                <td className="num">{r.gp}</td>
                <td className="num">{one(r.ppg)}</td>
                <td className="num">{one(r.oppg)}</td>
                <td className={`num ${netClass(r.net)}`}>{signed(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Leaders and club scoring for one season's regular season, without the view heading.
export function StatsBody({ season, onPickPlayer, onPickTeam }) {
  const box = useBox()
  const regular = useMemo(() => season.games.filter((g) => g.seasonType === 'regular'), [season])
  const players = useMemo(() => (box ? playerSeasons(regular, box) : null), [box, regular])
  if (!regular.some((g) => g.score)) {
    return <p className="empty">No games played yet in {season.year}. Leaders appear after the first night.</p>
  }
  if (!players) return <p className="dim">Loading box scores…</p>
  const missing = missingPoints(regular, box)
  return (
    <>
      <Leaders players={players} onPickPlayer={onPickPlayer} />
      {missing > 0 && (
        <p className="fine">
          The league&apos;s own box scores leave {missing} points this season without a player,
          so those points count for the club but for no one on these lists.
        </p>
      )}
      <TeamScoring games={regular} onPickTeam={onPickTeam} />
    </>
  )
}

export default function StatsView({ season, onPickPlayer, onPickTeam }) {
  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Stats</h2>
          <p className="sub">
            Regular-season leaders, added up from every box score. Free throws here can be worth
            one, two, or three points, so points come from the box score, not from makes.
          </p>
        </div>
      </div>
      <StatsBody season={season} onPickPlayer={onPickPlayer} onPickTeam={onPickTeam} />
    </section>
  )
}
