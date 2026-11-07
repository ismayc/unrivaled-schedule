// Auto-updating iCalendar feed for calendar subscriptions (webcal://).
//
// Unlike the in-app "download" (a one-time snapshot), a subscribed calendar re-fetches
// this endpoint periodically, so newly final scores and newly set tip times show up on
// their own. It serves the committed season: the league's site sends no CORS headers
// and publishes no feed, so there is no live overlay to add here, and the committed data
// is exactly what the app shows (the refresh workflow redeploys when it changes).
//
// This file lives OUTSIDE scripts/, so the "Node built-ins only" refresh-workflow guard
// does not apply: it may import from src/, and reuses the browser's buildIcs.
//
// Netlify Functions v2 (ESM default export). Query: ?teams=MIS,ROS filters to those clubs.
import { GAMES } from '../../src/data/schedule.js'
import { SEASON } from '../../src/data/teams.js'
import { buildIcs } from '../../src/utils/ics.js'

export default async (req) => {
  const teamsParam = new URL(req.url).searchParams.get('teams') || ''

  let games = GAMES
  let name = `Unrivaled ${SEASON}`
  if (teamsParam) {
    const want = new Set(
      teamsParam
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
    )
    games = games.filter((g) => want.has(g.home) || want.has(g.away))
    name = `Unrivaled ${SEASON}: My Clubs`
  }

  return new Response(buildIcs(games, { name }), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="unrivaled-${SEASON}.ics"`,
      'Cache-Control': 'public, max-age=1800',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
