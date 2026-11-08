#!/usr/bin/env node
// Has Unrivaled published the NEXT season's schedule yet?
//
// Nothing rolls over on its own: the refresh follows the committed teams.js season. So
// this reports the day the new schedule lands, and the rollover becomes a decision
// rather than a discovery. The family's other watches probe ESPN's scoreboard, which
// does not carry this league, so this one reads the league's own schedule page. See
// scripts/lib/season-watch.mjs for the signal and the trap it avoids (an unknown
// `?season=` returns the current season's games).
//
// Node built-ins only, so CI runs it on a bare checkout. Two requests a run at most.
//
//   node scripts/check-new-season.mjs [--season 2028]
//
// Exit 0 for "not yet" and for a release. A network failure or a format change on the
// bare schedule page throws, so an outage is a red run and not a quiet "not yet". The
// workflow reads the key=value lines on stdout.

import { getPage } from './lib/page.mjs'
import { parseSchedule } from './lib/unrivaled.mjs'
import { seasonsOf, seasonDone, judge } from './lib/season-watch.mjs'
import { SEASON as COMMITTED_SEASON } from '../src/data/teams.js'
import { GAMES } from '../src/data/schedule.js'

const args = process.argv.slice(2)
const NEXT = Number(args[args.indexOf('--season') + 1]) || COMMITTED_SEASON + 1

// A longer retry budget than the refresh's 4 tries: nothing waits on this job, so a slow
// answer is better than a red run on a short 5xx burst. The guards test pins it.
const WATCH_TRIES = 8

// A complete first release is at least about 90% of the committed regular season (56
// games in 2027). Derived, not hardcoded: the league grew from 6 to 8 clubs for 2026,
// and a fixed floor would misjudge the next expansion.
const REGULAR_COMMITTED = GAMES.filter((g) => g.seasonType === 'regular').length
const FLOOR = Math.floor(REGULAR_COMMITTED * 0.9)

const { years } = seasonsOf(await getPage('/schedule', WATCH_TRIES), '/schedule')
const listed = years.includes(NEXT)
let games = []
let problem = null
if (listed) {
  const path = `/schedule?season=${NEXT}`
  const tree = await getPage(path, WATCH_TRIES)
  // A new club or a new label makes the parser throw. That is a release that needs a
  // person (a CLUBS entry), so it files the issue as a partial release, not a red run.
  try {
    const { shown } = seasonsOf(tree, path)
    if (shown !== NEXT) throw new Error(`${path} shows the ${shown} season`)
    games = parseSchedule(tree, path)
  } catch (err) {
    problem = err.message.split('\n')[0]
  }
}

const v = judge({ next: NEXT, listed, games, problem, floor: FLOOR, committedDone: seasonDone(GAMES) })

// Consumed by the workflow through $GITHUB_OUTPUT: keep the keys stable and single-line.
console.log(`released=${v.released}`)
console.log(`season=${NEXT}`)
console.log(`year=${NEXT}`)
console.log(`count=${v.count}`)
console.log(`partial=${v.partial}`)
console.log(`ready=${v.ready}`)
console.log(`summary=${v.summary}`)
