// The feed the family hub reads (https://ismayc.github.io/ hub). Every other viewer in the
// family is on ESPN's scoreboard, which the hub fetches directly; Unrivaled is not on ESPN
// and its own site sends no CORS headers. This site and the hub share one origin, so the
// build publishes the committed season as `hub-feed.json` (see the hubFeed plugin in
// vite.config.js) and the hub fetches that. A refresh that changes the data rebuilds and
// redeploys the site, so the feed is exactly as fresh as this page.
//
// Kept small and literal: the hub derives its own buckets, states, and phase from it.
// `score` is [away, home], the hub's order, while this app's own games carry [home, away].
// `day` is set only for a game whose tip time is not announced: its `tip` is then a
// placeholder at 19:00 UTC, and the hub must file it by this date, not by that instant.

export const HUB_FEED_VERSION = 1

export function buildHubFeed({ games, teams, season, updatedAt, base }) {
  const url = base.endsWith('/') ? base : `${base}/`
  return {
    version: HUB_FEED_VERSION,
    season,
    updatedAt,
    teams: teams.map((t) => ({
      abbr: t.abbr,
      name: t.displayName || t.name,
      logo: `${url}logos/${t.slug}.png`,
    })),
    games: games
      .filter((g) => !g.canceled)
      .map((g) => ({
        id: g.id,
        tip: g.tip,
        ...(g.timeTbd ? { day: g.tip.slice(0, 10) } : {}),
        home: g.home,
        away: g.away,
        postseason: g.seasonType === 'playoffs',
        ...(g.round ? { round: g.round } : {}),
        ...(g.postponed ? { postponed: true } : {}),
        ...(g.score ? { score: [g.score[1], g.score[0]] } : {}),
        broadcast: g.broadcast || [],
      })),
  }
}
