// The derivations against the real seasons (test/fixtures/frozen/history.js is a copy of
// the committed archive). Each expected value was checked against an outside source on
// November 7, 2026:
//   - 2026 table: the league's own standings page, all eight rows (W, L, PF, PA, order).
//   - 2025 table: Wikipedia's 2025 Unrivaled season page; the seeds also follow from the
//     semifinal pairings (Lunar Owls v Vinyl, Rose v Laces).
//   - the 2025 Laces forfeit: CBS Sports, quoting league president Alex Bazzell.
//   - leaders: the league's stats page for each season.
import { describe, it, expect } from 'vitest'
import { HISTORY } from '../src/data/history.js'
import { BOX } from '../src/data/boxscores.js'
import {
  rankTable,
  computeStandings,
  playoffFormat,
  countsForStandings,
  resultOf,
  recordAgainst,
  breakTie,
} from '../src/utils/standings.js'
import { buildBracket, blindBracket } from '../src/utils/bracket.js'
import {
  playerSeasons,
  leaderboard,
  formatStat,
  missingPoints,
  teamScoring,
  LEADER_CATEGORIES,
} from '../src/utils/stats.js'
import { SEASONS, CURRENT, seasonByYear, ALL_GAMES, seasonOfGame } from '../src/utils/seasons.js'

const season = (y) => HISTORY.find((s) => s.year === y)
const table = (y) => rankTable(season(y).games, { year: y, clubs: season(y).clubs })

// A regular-season game for synthetic boards.
let n = 0
const game = (home, away, hs, as, extra = {}) => ({
  id: `t${n++}`,
  tip: `2027-01-${String(10 + (n % 18)).padStart(2, '0')}T00:00:00.000Z`,
  seasonType: 'regular',
  home,
  away,
  ...(hs == null ? {} : { score: [hs, as] }),
  ...extra,
})

describe('the 2026 table', () => {
  const rows = table(2026)

  it('matches the league standings page row for row', () => {
    expect(rows.map((r) => [r.abbr, r.w, r.l, r.pf, r.pa])).toEqual([
      ['PHA', 11, 3, 1027, 931],
      ['MIS', 10, 4, 1088, 979],
      ['LAC', 10, 4, 984, 907],
      ['ROS', 6, 8, 1003, 1047],
      ['BRE', 6, 8, 989, 974],
      ['VIN', 5, 9, 952, 982],
      ['LUN', 4, 10, 968, 1059],
      ['HIV', 4, 10, 935, 1067],
    ])
  })

  it('says which tiebreaker placed each tied club', () => {
    // Mist and Laces split 1-1, and Mist's differential is better. Rose and Breeze split
    // 1-1 too, and Rose's record against playoff clubs is better, though Breeze has the
    // better differential: the order the league published, and the one a
    // differential-only rule would get wrong.
    const tb = Object.fromEntries(rows.map((r) => [r.abbr, r.tiebreak]))
    expect(tb).toMatchObject({ PHA: null, MIS: 'diff', LAC: 'diff', ROS: 'vsPlayoff', BRE: 'vsPlayoff', LUN: 'diff' })
  })

  it('marks the six playoff clubs clinched and the other two eliminated, with games behind', () => {
    expect(rows.filter((r) => r.clinched).map((r) => r.abbr)).toEqual(['PHA', 'MIS', 'LAC', 'ROS', 'BRE', 'VIN'])
    expect(rows.filter((r) => r.eliminated).map((r) => r.abbr)).toEqual(['LUN', 'HIV'])
    expect(rows.map((r) => r.gb)).toEqual([0, 1, 1, 5, 5, 6, 7, 7])
  })

  it('reads streaks and the last five in play order', () => {
    expect(rows[0]).toMatchObject({ streak: 7, last5: ['W', 'W', 'W', 'W', 'W'] })
    expect(rows.find((r) => r.abbr === 'HIV').streak).toBe(-2)
  })
})

describe('the 2025 table', () => {
  const rows = table(2025)

  it('matches the published seeds, with the forfeit counted', () => {
    expect(rows.map((r) => [r.abbr, r.w, r.l])).toEqual([
      ['LUN', 13, 1],
      ['ROS', 8, 6],
      ['LAC', 7, 7],
      ['VIN', 5, 9],
      ['MIS', 5, 9],
      ['PHA', 4, 10],
    ])
  })

  it('counts the forfeit as a result but adds no points for it', () => {
    const f = season(2025).games.find((g) => g.forfeit)
    expect(f).toMatchObject({ forfeit: 'VIN', home: 'VIN', away: 'LAC', canceled: true })
    expect(countsForStandings(f)).toBe(true)
    expect(resultOf(f)).toEqual({ winner: 'VIN', loser: 'LAC' })
    expect(resultOf({ ...f, forfeit: 'LAC' })).toEqual({ winner: 'LAC', loser: 'VIN' })
    const vin = rows.find((r) => r.abbr === 'VIN')
    expect(vin.gp).toBe(14)
    expect(vin.scored).toBe(13)
  })

  it('puts four clubs in and marks the line on a finished table', () => {
    expect(rows.filter((r) => r.inPlayoffs).map((r) => r.abbr)).toEqual(['LUN', 'ROS', 'LAC', 'VIN'])
    expect(rows.filter((r) => r.clinched)).toHaveLength(4)
  })
})

describe('the playoff format', () => {
  it('is four clubs in 2025 and six from 2026, and carries forward', () => {
    expect(playoffFormat(2025)).toEqual({ spots: 4, byes: 4 })
    expect(playoffFormat(2026)).toEqual({ spots: 6, byes: 2 })
    expect(playoffFormat(2030)).toEqual({ spots: 6, byes: 2 })
    expect(playoffFormat(2024)).toEqual({ spots: 4, byes: 4 })
  })
})

describe('tiebreakers on synthetic boards', () => {
  it('falls back to the abbreviation when every step is level, and says so', () => {
    const games = [game('MIS', 'ROS', 70, 60), game('ROS', 'MIS', 70, 60)]
    const rows = rankTable(games, { year: 2027, clubs: ['MIS', 'ROS'] })
    expect(rows.map((r) => [r.abbr, r.tiebreak])).toEqual([
      ['MIS', 'coin'],
      ['ROS', 'coin'],
    ])
  })

  it('carries a three-way tie that is level at every step through to the coin', () => {
    // Each club beats each other once by ten: level on record, head-to-head, record
    // against playoff clubs, and differential.
    const g = [
      game('BRE', 'HIV', 70, 60),
      game('BRE', 'LAC', 70, 60),
      game('HIV', 'LAC', 70, 60),
      game('LAC', 'BRE', 70, 60),
      game('LAC', 'HIV', 70, 60),
      game('HIV', 'BRE', 70, 60),
    ]
    const rows = rankTable(g, { year: 2027, clubs: ['BRE', 'HIV', 'LAC'] })
    expect(rows.every((r) => r.w === 2)).toBe(true)
    expect(rows.map((r) => r.tiebreak)).toEqual(['coin', 'coin', 'coin'])
    expect(breakTie([], g, new Set())).toEqual([])
  })

  it('reads a record against a set of opponents, skipping unplayed games', () => {
    const g = [game('MIS', 'ROS', 70, 60), game('MIS', 'ROS'), game('VIN', 'MIS', 80, 60)]
    expect(recordAgainst(g, 'MIS', new Set(['ROS', 'VIN']))).toEqual({ w: 1, l: 1, pct: 0.5 })
    expect(recordAgainst(g, 'HIV', new Set(['ROS']))).toEqual({ w: 0, l: 0, pct: 0 })
  })

  it('counts games left, and skips postponed and canceled games and the playoffs', () => {
    const g = [
      game('MIS', 'ROS'),
      game('MIS', 'ROS', null, null, { postponed: true }),
      game('MIS', 'ROS', null, null, { canceled: true }),
      game('MIS', 'ROS', 70, 60, { seasonType: 'playoffs' }),
    ]
    const mis = computeStandings(g).find((r) => r.abbr === 'MIS')
    expect(mis).toMatchObject({ left: 1, gp: 0, streak: 0, netPpg: 0, pct: 0 })
  })

  it('clinches only when no tiebreak can take the spot away, mid-season', () => {
    // Seven clubs; one has won everything with one game left for each.
    const clubs = ['BRE', 'HIV', 'LAC', 'LUN', 'MIS', 'PHA', 'ROS', 'VIN']
    const g = []
    for (const c of clubs.slice(1)) for (let i = 0; i < 2; i++) g.push(game('BRE', c, 80, 60))
    for (const c of clubs) g.push(game(c, c === 'VIN' ? 'BRE' : 'VIN'))
    const rows = rankTable(g, { year: 2027, clubs })
    expect(rows[0]).toMatchObject({ abbr: 'BRE', clinched: true, eliminated: false })
    expect(rows.some((r) => r.clinched && r.abbr !== 'BRE')).toBe(false)
  })

  it('gives an empty table no rows, and a preseason table no marks', () => {
    expect(rankTable([], { year: 2027 })).toEqual([])
    const rows = rankTable([], { year: 2027, clubs: ['MIS', 'ROS'] })
    expect(rows.map((r) => [r.clinched, r.eliminated])).toEqual([
      [false, false],
      [false, false],
    ])
  })
})

describe('the brackets', () => {
  const show = (b) =>
    b.rounds.map((r) => [
      r.id,
      r.slots.map((s) => [s.top?.abbr ?? null, s.bottom?.abbr ?? null, s.winner?.abbr ?? null, s.projected]),
    ])

  it('rebuilds 2026 from its games: first round, reseeded semifinals, Mist champion', () => {
    const b = buildBracket(season(2026).games, { year: 2026, clubs: season(2026).clubs })
    expect(b.champion).toBe('MIS')
    expect(show(b)).toEqual([
      ['R1', [['LAC', 'VIN', 'VIN', false], ['ROS', 'BRE', 'BRE', false]]],
      ['SF', [['PHA', 'VIN', 'PHA', false], ['MIS', 'BRE', 'MIS', false]]],
      ['Final', [['PHA', 'MIS', 'MIS', false]]],
    ])
  })

  it('rebuilds 2025: four clubs straight to the semifinals, Rose champion', () => {
    const b = buildBracket(season(2025).games, { year: 2025, clubs: season(2025).clubs })
    expect(b.champion).toBe('ROS')
    expect(show(b)).toEqual([
      ['SF', [['LUN', 'VIN', 'VIN', false], ['ROS', 'LAC', 'ROS', false]]],
      ['Final', [['ROS', 'VIN', 'ROS', false]]],
    ])
  })

  it('hides every result in spoiler-free mode, keeping the seeded first round and the byes', () => {
    const b = blindBracket(buildBracket(season(2026).games, { year: 2026, clubs: season(2026).clubs }))
    expect(b.champion).toBeNull()
    expect(show(b)).toEqual([
      ['R1', [['LAC', 'VIN', null, false], ['ROS', 'BRE', null, false]]],
      ['SF', [['PHA', null, null, true], ['MIS', null, null, true]]],
      ['Final', [[null, null, null, true]]],
    ])
    expect(b.rounds[0].slots[0].game.score).toBeUndefined()
    const four = blindBracket(buildBracket(season(2025).games, { year: 2025, clubs: season(2025).clubs }))
    expect(four.rounds[0].slots[1].game.score).toBeUndefined()
  })

  it('projects from the table mid-season, and waits for both first-round games', () => {
    const b = buildBracket(CURRENT.games, { year: CURRENT.year, clubs: CURRENT.clubs })
    expect(b.seedsFinal).toBe(false)
    expect(b.rounds[0].slots.every((s) => s.projected)).toBe(true)
    expect(b.rounds[1].slots.map((s) => s.bottom)).toEqual([null, null])
    expect(b.champion).toBeNull()
    // One first-round game played: the semifinals still wait.
    const half = season(2026).games.filter((g) => !(g.round === 'R1' && g.home === 'ROS') && g.round !== 'SF' && g.round !== 'Final')
    const hb = buildBracket(half, { year: 2026, clubs: season(2026).clubs })
    expect(hb.rounds[1].slots.map((s) => s.bottom)).toEqual([null, null])
    expect(hb.rounds[0].slots[1]).toMatchObject({ game: null, projected: true })
  })
})

describe('the leaders, from box scores', () => {
  const regular = (y) => season(y).games.filter((g) => g.seasonType === 'regular')

  it('match the league stats page for both seasons', () => {
    const top = (y, k) => leaderboard(playerSeasons(regular(y), BOX), k, 3).map((p) => [p.name, +p[k].toFixed(1)])
    expect(top(2025, 'ppg')).toEqual([
      ['Napheesa Collier', 25.7],
      ['Kayla McBride', 22.4],
      ['Chelsea Gray', 21.4],
    ])
    expect(top(2026, 'ppg')).toEqual([
      ['Marina Mabrey', 25.3],
      ['Chelsea Gray', 24.2],
      ['Kelsey Plum', 22.6],
    ])
    expect(top(2026, 'apg')[0]).toEqual(['Chelsea Gray', 6.1])
    expect(top(2025, 'apg')[0]).toEqual(['Chelsea Gray', 5.5])
  })

  it('applies the attempt minimum to the percentage boards', () => {
    const players = playerSeasons(regular(2026), BOX)
    for (const p of leaderboard(players, 'fgPct', 50)) expect(p.fga).toBeGreaterThanOrEqual(4 * p.gp)
    for (const p of leaderboard(players, 'tpPct', 50)) expect(p.tpa).toBeGreaterThanOrEqual(1.5 * p.gp)
  })

  it('counts the 14 points a 2025 box score leaves out, and none in 2026', () => {
    expect(missingPoints(regular(2025), BOX)).toBe(14)
    expect(missingPoints(regular(2026), BOX)).toBe(0)
  })

  it('skips a game with no box score, and gives a shotless player no percentage', () => {
    const g = { id: 'none', home: 'MIS', away: 'ROS' }
    expect(playerSeasons([g], BOX)).toEqual([])
    const line = { id: 'p', name: 'P', min: 1, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 1, oreb: 0, dreb: 1, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, pm: 0 }
    const [p] = playerSeasons([g], { none: { MIS: [line], ROS: [] } })
    expect([p.fgPct, p.tpPct, p.ftPct]).toEqual([null, null, null])
  })

  it('formats each kind of stat', () => {
    const cat = (k) => LEADER_CATEGORIES.find((c) => c.key === k)
    expect(formatStat(cat('fgPct'), 0.5123)).toBe('51.2%')
    expect(formatStat(cat('pmpg'), 3.25)).toBe('+3.3')
    expect(formatStat(cat('pmpg'), -1)).toBe('-1.0')
    expect(formatStat(cat('ppg'), 20)).toBe('20.0')
  })

  it('ranks club scoring by net points, from results only', () => {
    const rows = teamScoring(season(2026).games)
    expect(rows[0]).toMatchObject({ abbr: 'MIS', gp: 14, pf: 1088, pa: 979 })
    expect(rows.reduce((a, r) => a + r.gp, 0)).toBe(112)
  })
})

describe('the seasons', () => {
  it('lists the current season first, then the archive, newest first', () => {
    expect(SEASONS.map((s) => [s.year, s.current])).toEqual([
      [2027, true],
      [2026, false],
      [2025, false],
    ])
    expect(seasonByYear(2025).champion).toBe('ROS')
    expect(seasonByYear(1999)).toBeNull()
    expect(ALL_GAMES).toHaveLength(56 + 61 + 45)
  })

  it('finds the season a game belongs to, and falls back to the current one', () => {
    expect(seasonOfGame(season(2025).games[0]).year).toBe(2025)
    expect(seasonOfGame({ id: 'stray' })).toBe(CURRENT)
  })
})
