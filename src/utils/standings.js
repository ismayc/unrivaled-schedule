import { TEAM_BY_ABBR } from '../data/teams.js'

// The regular-season table, derived from committed results so a bad refresh fails a test
// instead of rendering a wrong table.
//
// Seeding follows the league's published order (Swish Appeal, March 2025): win
// percentage, then head-to-head among the tied clubs, then record against playoff clubs,
// then point differential, then a coin flip. We cannot flip the league's coin, so the
// last step falls back to the abbreviation and the table says the order is unresolved.
// Checked against the league's own 2026 table (all eight rows: W, L, PF, PA and order)
// and the 2025 seeds, which the semifinal pairings confirm: test/standings.test.js.

// Playoff spots by season. 2025 sent four clubs straight to the semifinals; from 2026
// six qualify, seeds 3 to 6 play a first round, and the top two wait. Seasons after the
// newest known format inherit it until the league says otherwise.
const FORMATS = { 2025: { spots: 4, byes: 4 }, 2026: { spots: 6, byes: 2 } }
export function playoffFormat(year) {
  const known = Object.keys(FORMATS).map(Number).sort((a, b) => a - b)
  const use = known.filter((y) => y <= year).pop() ?? known[0]
  return FORMATS[use]
}

// A forfeit carries a winner and no score: it counts in W and L, never in points.
export const countsForStandings = (g) =>
  g.seasonType === 'regular' && (Boolean(g.score) || Boolean(g.forfeit))

export function resultOf(g) {
  if (g.forfeit) return { winner: g.forfeit, loser: g.forfeit === g.home ? g.away : g.home }
  const [h, a] = g.score
  return h > a ? { winner: g.home, loser: g.away } : { winner: g.away, loser: g.home }
}

const pctOf = (w, l) => (w + l ? w / (w + l) : 0)

export function computeStandings(games, clubs) {
  const rows = new Map()
  const row = (abbr) => {
    if (!rows.has(abbr))
      rows.set(abbr, {
        abbr,
        team: TEAM_BY_ABBR[abbr],
        w: 0,
        l: 0,
        pf: 0,
        pa: 0,
        scored: 0, // games with points (a forfeit has none)
        home: { w: 0, l: 0 },
        road: { w: 0, l: 0 },
        results: [], // 'W' | 'L', in tip order
        left: 0,
      })
    return rows.get(abbr)
  }
  for (const c of clubs || []) row(c)
  const ordered = [...games].sort((a, b) => a.tip.localeCompare(b.tip))
  for (const g of ordered) {
    if (g.seasonType !== 'regular') continue
    if (!countsForStandings(g)) {
      if (!g.canceled && !g.postponed) (row(g.home).left++, row(g.away).left++)
      continue
    }
    const { winner } = resultOf(g)
    for (const side of ['home', 'away']) {
      const r = row(g[side])
      const won = g[side] === winner
      won ? r.w++ : r.l++
      r[side === 'home' ? 'home' : 'road'][won ? 'w' : 'l']++
      r.results.push(won ? 'W' : 'L')
      if (g.score) {
        const [h, a] = g.score
        r.pf += side === 'home' ? h : a
        r.pa += side === 'home' ? a : h
        r.scored++
      }
    }
  }
  return [...rows.values()].map((r) => {
    const last = r.results.at(-1)
    let streak = 0
    for (let i = r.results.length - 1; i >= 0 && r.results[i] === last; i--) streak++
    return {
      ...r,
      gp: r.w + r.l,
      pct: pctOf(r.w, r.l),
      diff: r.pf - r.pa,
      netPpg: r.scored ? (r.pf - r.pa) / r.scored : 0,
      last5: r.results.slice(-5),
      streak: last ? (last === 'W' ? streak : -streak) : 0,
    }
  })
}

// W-L of `abbr` in counted regular-season games against any club in `opponents`.
export function recordAgainst(games, abbr, opponents) {
  let w = 0
  let l = 0
  for (const g of games) {
    if (!countsForStandings(g)) continue
    const opp = g.home === abbr ? g.away : g.away === abbr ? g.home : null
    if (!opp || !opponents.has(opp)) continue
    resultOf(g).winner === abbr ? w++ : l++
  }
  return { w, l, pct: pctOf(w, l) }
}

// Orders one group of clubs level on win percentage. Each step can split the group into
// tiers; a tier that is still level moves on to the next step with only its own members
// (so head-to-head is recomputed among the clubs still tied).
const STEPS = ['h2h', 'vsPlayoff', 'diff', 'coin']
export function breakTie(group, games, playoffClubs, step = 0, trace = {}) {
  if (group.length < 2) return group
  const kind = STEPS[step]
  const members = new Set(group.map((r) => r.abbr))
  if (kind === 'coin') {
    for (const r of group) trace[r.abbr] = 'coin'
    return [...group].sort((a, b) => a.abbr.localeCompare(b.abbr))
  }
  const key = {
    h2h: (r) => recordAgainst(games, r.abbr, members).pct,
    vsPlayoff: (r) => recordAgainst(games, r.abbr, new Set([...playoffClubs].filter((c) => c !== r.abbr))).pct,
    diff: (r) => r.diff,
  }[kind]
  const tiers = new Map()
  for (const r of group) {
    const k = key(r)
    if (!tiers.has(k)) tiers.set(k, [])
    tiers.get(k).push(r)
  }
  const sorted = [...tiers.entries()].sort(([a], [b]) => b - a)
  const out = []
  for (const [, tier] of sorted) {
    if (tier.length === 1 && sorted.length > 1) trace[tier[0].abbr] ||= kind
    out.push(...breakTie(tier, games, playoffClubs, step + 1, trace))
  }
  return out
}

// The ranked table: seed, games behind, playoff line, and how each tie was broken.
export function rankTable(games, { year, clubs } = {}) {
  const rows = computeStandings(games, clubs)
  const { spots } = playoffFormat(year)
  const byPct = [...rows].sort((a, b) => b.pct - a.pct)
  // "Playoff clubs" for the second tiebreaker: every club at or above the win
  // percentage of the last playoff spot, so a club tied for that spot counts too.
  const linePct = byPct[Math.min(spots, byPct.length) - 1]?.pct ?? 0
  const playoffClubs = new Set(byPct.filter((r) => r.pct >= linePct).map((r) => r.abbr))
  const groups = new Map()
  for (const r of byPct) {
    if (!groups.has(r.pct)) groups.set(r.pct, [])
    groups.get(r.pct).push(r)
  }
  const trace = {}
  const ordered = [...groups.values()].flatMap((g) => breakTie(g, games, playoffClubs, 0, trace))
  const leader = ordered[0]
  const n = ordered.length
  // With nothing left to play the table is final and the line itself decides.
  const done = n > 0 && ordered.every((r) => r.left === 0)
  return ordered.map((r, i) => {
    // Clinch and elimination on wins alone, counting a tie as a loss for the club in
    // question, so a mark never appears that a tiebreaker could take away.
    const maxWins = (x) => x.w + x.left
    const others = ordered.filter((o) => o !== r)
    const canPass = others.filter((o) => maxWins(o) >= r.w).length
    const ahead = others.filter((o) => o.w > maxWins(r)).length
    const inPlayoffs = i < spots
    return {
      ...r,
      seed: i + 1,
      inPlayoffs,
      gb: (leader.w - r.w + (r.l - leader.l)) / 2,
      tiebreak: trace[r.abbr] || null,
      clinched: n > spots && (done ? inPlayoffs : canPass < spots),
      eliminated: n > spots && (done ? !inPlayoffs : ahead >= spots),
    }
  })
}

export const TIEBREAK_LABELS = {
  h2h: 'head-to-head',
  vsPlayoff: 'record vs. playoff clubs',
  diff: 'point differential',
  coin: 'unresolved (the league flips a coin)',
}
