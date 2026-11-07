// Season numbers derived from the committed box scores (src/data/boxscores.js), so the
// leaders, a club's roster, and a player's game log all come from one source and agree
// with the scores on the cards.
//
// Two facts about the source shape the math:
//   - Free throws here can be worth 1, 2 or 3 points, so points are summed from each
//     line's PTS and never rebuilt from makes.
//   - A few league box scores leave out a player who scored (`gaps` on the game: the
//     TEAM row minus the players). Those points are in the club's score but in no
//     player's line, and the leaders view says so.

const SUMS = ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'to', 'pf', 'pm']

// Every player who appeared in `games`, with season totals and per-game averages.
// `box` maps game id → { [club]: lines[], gaps? }.
export function playerSeasons(games, box) {
  const players = new Map()
  for (const g of games) {
    const b = box[g.id]
    if (!b) continue
    for (const club of [g.home, g.away]) {
      for (const line of b[club] || []) {
        if (line.dnp) continue
        let p = players.get(line.id)
        if (!p) {
          p = { id: line.id, name: line.name, clubs: [], gp: 0, log: [] }
          for (const k of SUMS) p[k] = 0
          players.set(line.id, p)
        }
        if (!p.clubs.includes(club)) p.clubs.push(club)
        p.gp++
        for (const k of SUMS) p[k] += line[k]
        p.log.push({ game: g, club, line })
      }
    }
  }
  return [...players.values()].map((p) => {
    const per = (k) => p[k] / p.gp
    return {
      ...p,
      club: p.log.at(-1).club,
      ppg: per('pts'),
      rpg: per('reb'),
      apg: per('ast'),
      spg: per('stl'),
      bpg: per('blk'),
      mpg: per('min'),
      pmpg: per('pm'),
      fgPct: p.fga ? p.fgm / p.fga : null,
      tpPct: p.tpa ? p.tpm / p.tpa : null,
      ftPct: p.fta ? p.ftm / p.fta : null,
    }
  })
}

// Leaderboard categories. Averages need half the most games anyone played, so a player
// who appeared twice cannot lead; percentages also need a minimum of attempts.
export const LEADER_CATEGORIES = [
  { key: 'ppg', label: 'Points', unit: 'PPG' },
  { key: 'rpg', label: 'Rebounds', unit: 'RPG' },
  { key: 'apg', label: 'Assists', unit: 'APG' },
  { key: 'spg', label: 'Steals', unit: 'SPG' },
  { key: 'bpg', label: 'Blocks', unit: 'BPG' },
  { key: 'fgPct', label: 'Field goal %', unit: 'FG%', pct: true, attempts: 'fga', perGame: 4 },
  { key: 'tpPct', label: 'Three-point %', unit: '3P%', pct: true, attempts: 'tpa', perGame: 1.5 },
  { key: 'pmpg', label: 'Plus-minus', unit: '+/- per game', signed: true },
]

export function leaderboard(players, key, limit = 10) {
  const cat = LEADER_CATEGORIES.find((c) => c.key === key)
  const maxGp = Math.max(0, ...players.map((p) => p.gp))
  const qualified = players.filter(
    (p) => p.gp >= maxGp / 2 && p[key] != null && (!cat.attempts || p[cat.attempts] >= cat.perGame * p.gp)
  )
  return qualified.sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name)).slice(0, limit)
}

export function formatStat(cat, v) {
  if (cat.pct) return `${(v * 100).toFixed(1)}%`
  const s = v.toFixed(1)
  return cat.signed && v > 0 ? `+${s}` : s
}

// Points the league's box scores leave unassigned, summed over `games`.
export function missingPoints(games, box) {
  let n = 0
  for (const g of games) for (const v of Object.values(box[g.id]?.gaps || {})) n += v
  return n
}

// Per-club scoring from the results themselves (forfeits carry no points).
export function teamScoring(games) {
  const rows = new Map()
  for (const g of games) {
    if (!g.score || g.seasonType !== 'regular') continue
    const [h, a] = g.score
    for (const [club, pf, pa] of [[g.home, h, a], [g.away, a, h]]) {
      const r = rows.get(club) || { abbr: club, gp: 0, pf: 0, pa: 0 }
      r.gp++
      r.pf += pf
      r.pa += pa
      rows.set(club, r)
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, ppg: r.pf / r.gp, oppg: r.pa / r.gp, net: (r.pf - r.pa) / r.gp }))
    .sort((a, b) => b.net - a.net)
}
