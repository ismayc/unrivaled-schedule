import { GAMES } from '../data/schedule.js'
import { SEASON, ALL_ABBRS } from '../data/teams.js'
import { HISTORY } from '../data/history.js'

// Every season the app holds, newest first, in one shape: { year, games, clubs }. The
// current season is the committed schedule; the archive is history.js. Views take a
// season rather than reaching for GAMES, so the History tab renders an archived season
// through exactly the components the current one uses.
export const CURRENT = { year: SEASON, games: GAMES, clubs: ALL_ABBRS, current: true }

export const SEASONS = [CURRENT, ...HISTORY.map((s) => ({ ...s, current: false }))]

export const seasonByYear = (year) => SEASONS.find((s) => s.year === year) || null

// Every game of every season, for a player's career and a club's all-time record.
export const ALL_GAMES = SEASONS.flatMap((s) => s.games)

// The season a game belongs to.
export const seasonOfGame = (game) => SEASONS.find((s) => s.games.includes(game)) || CURRENT
