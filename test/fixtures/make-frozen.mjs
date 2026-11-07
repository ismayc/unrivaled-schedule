#!/usr/bin/env node
// Writes the frozen stand-ins the test suite reads instead of src/data (see the
// frozenData plugin in vite.config.js). Run by hand, never by the refresh:
//
//   node test/fixtures/make-frozen.mjs
//
// The current season is a mid-season board built from the 2026 regular season, moved
// forward 52 weeks (so every game keeps its weekday) and renamed with an `f-` prefix.
// Games before February 10, 2027 keep their results; later ones are unplayed. One
// unplayed game has no tip time and no channel yet, one is postponed, and three stream
// on HBO Max alone, so those paths have data. History, teams and box scores are copies of the committed modules at the
// time this ran, plus box scores for the frozen played games.
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HISTORY } from '../../src/data/history.js'
import { TEAMS, SEASON } from '../../src/data/teams.js'
import { BOX } from '../../src/data/boxscores.js'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'frozen')
const WEEKS_52 = 364 * 86400e3
const CUTOFF = Date.parse('2027-02-10T00:00:00Z')

const src = HISTORY.find((s) => s.year === 2026).games.filter((g) => g.seasonType === 'regular')
const games = src.map((g) => {
  const tip = new Date(Date.parse(g.tip) + WEEKS_52).toISOString()
  const out = { ...g, id: `f-${g.id}`, tip }
  if (Date.parse(tip) >= CUTOFF) {
    delete out.score
    delete out.line
    delete out.stars
  }
  return out
})
const unplayed = games.filter((g) => !g.score)
Object.assign(unplayed.at(-1), { timeTbd: true, broadcast: [] })
Object.assign(unplayed.at(-2), { postponed: true, note: 'Postponed; makeup date to be announced' })
// The 2027 schedule streams some games on HBO Max alone (the 2026 one never did), so the
// "on my services" filter has a game to drop for a viewer with only a TV bundle.
for (const g of unplayed.slice(-5, -2)) g.broadcast = ['HBO Max']

const box = { ...BOX }
for (const g of games) if (g.score) box[g.id] = BOX[g.id.slice(2)]

const banner = '// FROZEN test stand-in written by test/fixtures/make-frozen.mjs; do not edit by hand.\n\n'
const j = (x) => JSON.stringify(x)
await writeFile(join(OUT, 'schedule.js'), `${banner}export const GAMES = [\n${games.map((g) => `  ${j(g)},`).join('\n')}\n]\n\nexport const PENDING = []\n\nexport const SEASON_TYPES = ['regular', 'playoffs']\n\nexport const PLAYOFF_ROUNDS = { R1: 'First Round', SF: 'Semifinals', Final: 'Championship' }\n`)
await writeFile(join(OUT, 'teams.js'), `${banner}export const SEASON = ${SEASON}\n\nexport const TEAMS = ${JSON.stringify(TEAMS, null, 2)}\n\nexport const TEAM_BY_ABBR = Object.fromEntries(TEAMS.map((t) => [t.abbr, t]))\n\nexport const ALL_ABBRS = TEAMS.filter((t) => t.seasons.includes(SEASON)).map((t) => t.abbr)\n`)
await writeFile(join(OUT, 'history.js'), `${banner}export const HISTORY = ${JSON.stringify(HISTORY)}\n\nexport const HISTORY_BY_YEAR = Object.fromEntries(HISTORY.map((s) => [s.year, s]))\n\nexport const HISTORY_YEARS = HISTORY.map((s) => s.year)\n`)
await writeFile(join(OUT, 'boxscores.js'), `${banner}export const BOX = ${JSON.stringify(box)}\n`)
// Chosen to differ from any live stamp, so guards.test.js can tell the two apart.
await writeFile(join(OUT, 'meta.js'), `${banner}export const DATA_UPDATED_AT = '2027-02-09T12:00:00.000Z'\n`)
console.log(`${games.length} games, ${games.filter((g) => g.score).length} played`)
