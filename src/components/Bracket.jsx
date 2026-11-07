import { useMemo } from 'react'
import { buildBracket, blindBracket } from '../utils/bracket.js'
import { playoffFormat } from '../utils/standings.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { formatDate, gameTime } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

function Side({ entry, score, won, decided, onPick, hideScores }) {
  const { isFollowed } = useFollow()
  if (!entry) {
    return (
      <div className="bx-side bx-empty">
        <span className="bx-feeder">To be decided</span>
      </div>
    )
  }
  const team = TEAM_BY_ABBR[entry.abbr]
  return (
    <div
      className={`bx-side ${won ? 'bx-won' : decided ? 'bx-lost' : ''} ${
        isFollowed(entry.abbr) ? 'followed' : ''
      }`}
    >
      <span className="bx-seed">{entry.seed}</span>
      <button className="bx-team" onClick={() => onPick?.(entry.abbr)}>
        <TeamLogo abbr={entry.abbr} size={24} />
        <span className="bx-name">{team.name}</span>
      </button>
      {score != null && !hideScores && <span className="bx-wins">{score}</span>}
    </div>
  )
}

// One single-game slot. The game, once it exists, opens the game detail.
function Slot({ slot, tz, onPick, onOpen, hideScores }) {
  const { game, top, bottom, winner } = slot
  const scoreOf = (entry) =>
    game?.score && entry ? (game.home === entry.abbr ? game.score[0] : game.score[1]) : null
  return (
    <div className={`bx-series ${slot.projected ? 'is-proj' : ''} ${winner ? 'is-done' : ''}`}>
      <Side
        entry={top}
        score={scoreOf(top)}
        won={winner && winner === top}
        decided={!!winner}
        onPick={onPick}
        hideScores={hideScores}
      />
      <Side
        entry={bottom}
        score={scoreOf(bottom)}
        won={winner && winner === bottom}
        decided={!!winner}
        onPick={onPick}
        hideScores={hideScores}
      />
      {game && (
        <div className="bx-foot">
          <button className="bx-open" onClick={() => onOpen?.(game)}>
            {formatDate(game.tip, tz)}
            {!game.score && ` · ${gameTime(game, tz)}`}
          </button>
        </div>
      )}
    </div>
  )
}

// The bracket alone, without the view heading, so History can render an archived season
// through the same component.
export function BracketBody({ season, tz, onPick, onOpen, hideScores = false }) {
  const { games, year, clubs } = season
  const bracket = useMemo(() => {
    const built = buildBracket(games, { year, clubs })
    return hideScores ? blindBracket(built) : built
  }, [games, year, clubs, hideScores])
  const started = games.some((g) => g.seasonType === 'regular' && (g.score || g.forfeit))

  if (!started) {
    return (
      <p className="banner">
        The bracket appears once the {year} season tips off and the table has something to seed.
      </p>
    )
  }
  const anyPlayoffGame = games.some((g) => g.seasonType === 'playoffs')
  return (
    <>
      {!bracket.seedsFinal && !anyPlayoffGame && (
        <p className="banner">
          <strong>Projected.</strong> The regular season is still going, so this is the bracket you
          would get if it ended today.
        </p>
      )}
      {bracket.champion && (
        <p className="banner banner-champ">
          🏆 <strong>{TEAM_BY_ABBR[bracket.champion].name}</strong> won the {year} title.
        </p>
      )}
      <div className="bx bx-single">
        {bracket.rounds.map((r) => (
          <div className={`bx-col ${r.id === 'Final' ? 'bx-col-final' : ''}`} key={r.id}>
            <h4 className="bx-round">{r.label}</h4>
            {r.slots.map((s, i) => (
              <Slot key={i} slot={s} tz={tz} onPick={onPick} onOpen={onOpen} hideScores={hideScores} />
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

export const formatNote = (year) => {
  const { spots, byes } = playoffFormat(year)
  return byes < spots
    ? `Six clubs qualify. Seeds 3 to 6 play a first round; the top two wait. The semifinals reseed, so the 1 seed meets the lowest seed left. Every round is one game.`
    : `Four clubs qualify: 1 v 4 and 2 v 3 in the semifinals, then the championship. Every round is one game.`
}

export default function Bracket({ season, tz, onPick, onOpen, hideScores = false }) {
  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Playoffs</h2>
          <p className="sub">{formatNote(season.year)}</p>
        </div>
      </div>
      <BracketBody season={season} tz={tz} onPick={onPick} onOpen={onOpen} hideScores={hideScores} />
    </section>
  )
}
