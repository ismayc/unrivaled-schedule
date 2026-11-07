import { rankTable, playoffFormat } from './standings.js'

// The playoff bracket: single games, not series. DOM-free so it can be tested against
// real seasons.
//
//   2025 (four clubs):  Semifinals 1 v 4, 2 v 3 → Championship
//   2026 on (six clubs): First Round 3 v 6, 4 v 5 → Semifinals, reseeded: the 1 seed
//                        meets the lowest seed left, the 2 seed the other → Championship
//
// Both are confirmed by the played games: in 2026 Phantom (1) met Vinyl (6) and Mist (2)
// met Breeze (5) after the 6 and 5 seeds won their first-round games.
//
// Every slot carries the two clubs it would hold and, once played, the game. Clubs come
// from the regular-season table until a game is on the schedule; a slot built that way
// is `projected` and the view says so.

export const ROUND_LABELS = { R1: 'First Round', SF: 'Semifinals', Final: 'Championship' }

const winnerOf = (g) => (g?.score ? (g.score[0] > g.score[1] ? g.home : g.away) : null)

// The playoff game between two clubs, in either home/away order.
const findGame = (playoffs, round, a, b) =>
  playoffs.find(
    (g) => g.round === round && ((g.home === a && g.away === b) || (g.home === b && g.away === a))
  ) || null

function slot(round, top, bottom, playoffs, projected) {
  // Every caller passes both clubs; a slot still waiting on one is built elsewhere.
  const game = findGame(playoffs, round, top.abbr, bottom.abbr)
  const w = winnerOf(game)
  return {
    round,
    top,
    bottom,
    game,
    winner: w ? (w === top.abbr ? top : bottom) : null,
    projected: projected || !game,
  }
}

export function buildBracket(games, { year, clubs } = {}) {
  const table = rankTable(games, { year, clubs })
  const { spots, byes } = playoffFormat(year)
  const playoffs = games.filter((g) => g.seasonType === 'playoffs')
  const seeds = table.slice(0, spots).map((r) => ({ abbr: r.abbr, seed: r.seed }))
  // Before any playoff game exists the seeds themselves are a projection unless the
  // regular season is over.
  const seedsFinal = table.length > 0 && table.every((r) => r.left === 0)
  const rounds = []

  let semifinalists
  if (byes < spots) {
    // First round: the clubs below the byes, highest against lowest.
    const field = seeds.slice(byes)
    const r1 = []
    for (let i = 0; i < field.length / 2; i++)
      r1.push(slot('R1', field[i], field[field.length - 1 - i], playoffs, !seedsFinal))
    rounds.push({ id: 'R1', label: ROUND_LABELS.R1, slots: r1 })
    const advancing = r1.map((s) => s.winner).filter(Boolean)
    semifinalists = advancing.length === r1.length ? [...seeds.slice(0, byes), ...advancing] : null
  } else {
    semifinalists = seeds
  }

  // Semifinals, reseeded: best seed left against the worst seed left.
  let sf
  if (semifinalists && semifinalists.length === 4) {
    const s = [...semifinalists].sort((a, b) => a.seed - b.seed)
    sf = [slot('SF', s[0], s[3], playoffs, !seedsFinal), slot('SF', s[1], s[2], playoffs, !seedsFinal)]
  } else {
    // Byes known, opponents not yet: show the top seeds waiting.
    sf = seeds.slice(0, 2).map((t) => ({ round: 'SF', top: t, bottom: null, game: null, winner: null, projected: true }))
  }
  rounds.push({ id: 'SF', label: ROUND_LABELS.SF, slots: sf })

  const finalists = sf.map((s) => s.winner)
  const final =
    finalists.every(Boolean)
      ? slot('Final', ...finalists.sort((a, b) => a.seed - b.seed), playoffs, false)
      : { round: 'Final', top: null, bottom: null, game: null, winner: null, projected: true }
  rounds.push({ id: 'Final', label: ROUND_LABELS.Final, slots: [final] })

  return { rounds, champion: final.winner?.abbr || null, seeds, seedsFinal }
}

// The same bracket with every result hidden, for spoiler-free mode: clubs stay where the
// seeding put them, but nothing says who advanced, so later rounds show as undecided.
const EMPTY = (round) => ({ round, top: null, bottom: null, game: null, winner: null, projected: true })
const hideResult = (s) => ({ ...s, winner: null, game: s.game && { ...s.game, score: undefined } })

export function blindBracket(bracket) {
  const first = bracket.rounds[0].id
  return {
    ...bracket,
    champion: null,
    rounds: bracket.rounds.map((r) => ({
      ...r,
      slots:
        r.id === first
          ? r.slots.map(hideResult)
          : r.id === 'SF'
            ? // The byes are known from the table; who meets them is a result.
              bracket.seeds.slice(0, 2).map((t) => ({ ...EMPTY('SF'), top: t }))
            : r.slots.map((s) => EMPTY(s.round)),
    })),
  }
}
