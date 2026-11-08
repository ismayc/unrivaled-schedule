// The new-season watch's logic, kept apart from the fetching so the tests run it offline.
// Node built-ins only.
//
// How the league site says a season exists (checked November 8, 2026): the schedule page
// carries a client component whose props hold `seasonYears` (every season the season
// picker offers, newest first, e.g. ["2027","2026","2025"]) and `seasonYear` (the season
// the page is showing).
//
// The trap: `/schedule?season=Y` for a season the site does not have answers HTTP 200
// with the CURRENT season's games. On November 8, 2026, `?season=2028` and
// `?season=2099` both returned the 56 games of 2027 with `seasonYear` "2027". A watch
// that counted the games on `?season=2028` would report 2028 as out on its first run. So
// the release signal is the picker list, and the game count is trusted only when
// `seasonYear` names the season that was asked for.

import { walk } from './rsc.mjs'

export function seasonsOf(tree, where) {
  for (const n of walk(tree)) {
    const p = n.props
    if (Array.isArray(p?.seasonYears) && typeof p.seasonYear === 'string') {
      return { years: p.seasonYears.map(Number), shown: Number(p.seasonYear) }
    }
  }
  throw new Error(`${where}: no season picker (seasonYears) on the page: the site changed its format`)
}

// Every club plays the same number of games in a complete schedule.
export function clubCounts(games) {
  const per = {}
  for (const g of games) for (const c of [g.away, g.home]) per[c] = (per[c] || 0) + 1
  return per
}

// A league season is done when its Championship game has a score.
export const seasonDone = (games) => games.some((g) => g.round === 'Final' && Array.isArray(g.score))

// The verdict the workflow acts on.
//   released  the picker lists the next season
//   partial   listed, but the schedule is short, uneven, or unreadable: file the issue only
//   ready     a complete release AND the committed season is finished: draft the PR too
export function judge({ next, listed, games = [], problem = null, floor, committedDone }) {
  const label = String(next)
  if (!listed) {
    return { released: false, partial: false, ready: false, count: 0, summary: `Not yet: the league's season picker does not list ${label}.` }
  }
  const per = clubCounts(games)
  const counts = new Set(Object.values(per))
  const why = []
  if (problem) why.push(`the page could not be read (${problem})`)
  else if (games.length === 0) why.push('the picker lists it, but no games are posted')
  else {
    if (games.length < floor) why.push(`${games.length} games, and a complete release is at least ${floor}`)
    if (counts.size > 1) why.push(`the clubs have uneven game counts ${JSON.stringify(per)}`)
  }
  const partial = why.length > 0
  const ready = !partial && committedDone
  let summary = `${label} schedule is OUT: ${games.length} games, ${Object.keys(per).length} clubs.`
  if (partial) summary += ` PARTIAL: ${why.join('; ')}.`
  else if (!committedDone) summary += ' The committed season is not finished yet, so no rollover PR until its Championship is final.'
  return { released: true, partial, ready, count: games.length, summary }
}
