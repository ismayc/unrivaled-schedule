import { TEAM_BY_ABBR } from '../data/teams.js'
import { formatZoneAbbr, liveState, gameTime, gameCountdown, isImminent } from '../utils/time.js'
import { watchableServices, broadcastNotBadged } from '../utils/watch.js'
import { useFollow } from '../context/follow.jsx'
import { useServices } from '../context/services.jsx'
import TeamLogo from './TeamLogo.jsx'

function Side({ abbr, score, winner, hideScores }) {
  const team = TEAM_BY_ABBR[abbr]
  const { isFollowed, toggle } = useFollow()
  const on = isFollowed(abbr)

  return (
    <div className={`side ${winner ? 'winner' : ''} ${on ? 'followed' : ''}`}>
      <button
        className={`star ${on ? 'on' : ''}`}
        // The whole card is a button that opens the game detail, so the star has to
        // stop the click from reaching it — otherwise following also opens a modal.
        onClick={(e) => {
          e.stopPropagation()
          toggle(abbr)
        }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-pressed={on}
        aria-label={`${on ? 'Unfollow' : 'Follow'} ${team.name}`}
        title={`${on ? 'Unfollow' : 'Follow'} ${team.name}`}
      >
        {on ? '★' : '☆'}
      </button>
      <TeamLogo abbr={abbr} size={32} />
      <span className="side-name">
        <span className="side-nick">{team.name}</span>
      </span>
      {score != null && !hideScores && <span className="side-score">{score}</span>}
    </div>
  )
}

// The when-column: in progress, void badge, final, or tip time. There is no live feed,
// so a game that has tipped and has no score yet says so instead of showing a period.
function Timing({ game, tz, state }) {
  return (
    <div className="game-when">
      {state === 'likely-live' ? (
        <span className="live-badge" title="Tipped; the score arrives with the next refresh">
          ● In progress
        </span>
      ) : state === 'void' ? (
        <span className="void-badge">{game.canceled ? 'Canceled' : 'Postponed'}</span>
      ) : game.score ? (
        <span className="final-badge">Final</span>
      ) : (
        <>
          <span className="time">{gameTime(game, tz)}</span>
          {!game.timeTbd && <span className="zone">{formatZoneAbbr(game.tip, tz)}</span>}
          {isImminent(game) && (
            <span className="pregame-badge" title="Scheduled tip">
              Pre-game
            </span>
          )}
        </>
      )}
    </div>
  )
}

// The 📺 badge + the leftover networks, shared by both card types.
function Meta({ game, watch, lead, extra, channelTba }) {
  const meta = []
  if (game.venue) meta.push(game.city ? `${game.venue}, ${game.city}` : game.venue)
  // Drop any network already shown as a badge (e.g. "Peacock") so it isn't repeated; a
  // bundle badge's underlying network (TNT for YouTube TV) still shows.
  const networks = broadcastNotBadged(game.broadcast, watch)
  if (networks.length) meta.push(networks.slice(0, 3).join(' · '))

  return (
    <div className="game-meta">
      {lead}
      {meta.map((m) => (
        <span key={m}>{m}</span>
      ))}
      {channelTba && <span className="net-tba">Channel TBA</span>}
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
      {extra}
    </div>
  )
}

export default function GameCard({ game, tz, hideScores, onOpen }) {
  const { services } = useServices()
  const state = liveState(game)
  const scored = game.score && !hideScores
  const [hs, as] = game.score || []
  const homeWon = scored && hs > as
  const awayWon = scored && as > hs

  // Which of the viewer's chosen services carry this game — a 📺 icon plus a label
  // per service. Empty (no badge) until the viewer picks services.
  const watch = watchableServices(game.broadcast, services)

  const open = () => onOpen?.(game)
  const onKey = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())

  return (
    <article className={`game state-${state}`} role="button" tabIndex={0} onClick={open} onKeyDown={onKey}>
      <Timing game={game} tz={tz} state={state} />

      <div className="game-teams">
        <Side abbr={game.away} score={as} winner={awayWon} hideScores={hideScores} />
        <span className="at">@</span>
        <Side abbr={game.home} score={hs} winner={homeWon} hideScores={hideScores} />
      </div>

      <Meta
        game={game}
        watch={watch}
        channelTba={state === 'upcoming' && !game.broadcast?.length}
        lead={game.note && <span className="note">{game.note}</span>}
        extra={
          state === 'upcoming' &&
          gameCountdown(game) && <span className="countdown">in {gameCountdown(game)}</span>
        }
      />
    </article>
  )
}
