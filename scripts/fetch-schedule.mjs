#!/usr/bin/env node
// Regenerates src/data/{teams,schedule,history,boxscores}.js from unrivaled.basketball,
// and mirrors each club's crest into public/logos/ so the app makes no external image
// requests. Node built-ins only, so CI runs it on a bare checkout.
//
//   node scripts/fetch-schedule.mjs [--season 2027] [--full] [--no-logos]
//
// Unrivaled is not on ESPN and publishes no feed (see scripts/lib/rsc.mjs), so this reads
// the league's own pages: one schedule page per season, then one game page per game and a
// box-score page per finished game. It is polite on purpose: one request at a time with a
// pause between them, and a finished game is never fetched again once its box score is
// committed. A normal refresh fetches the schedule pages plus only the games near now;
// `--full` refetches every unfinished game (tip times and channels set weeks ahead).

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sleep } from './lib/fetch.mjs'
import { createDataWriter } from './lib/stamp.mjs'
import { getPage, PAUSE_MS, HEADERS, requestCount, countRequest } from './lib/page.mjs'
import { SITE, CLUBS, parseSchedule, parseGame, parseBoxScore, boxGaps } from './lib/unrivaled.mjs'
import { SEASON as COMMITTED_SEASON } from '../src/data/teams.js'
import { GAMES as COMMITTED_GAMES } from '../src/data/schedule.js'
import { HISTORY as COMMITTED_HISTORY } from '../src/data/history.js'
import { BOX as COMMITTED_BOX } from '../src/data/boxscores.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
// The season the app is committed to, not the calendar year: a calendar default flips
// to an unpublished season every January 1 (the NBA sibling's rollover bug).
const SEASON = Number(args[args.indexOf('--season') + 1]) || COMMITTED_SEASON
const FULL = args.includes('--full')
const WITH_LOGOS = !args.includes('--no-logos')

// The league's first season was 2025. Every season through the current one is fetched;
// the past ones are archived into history.js and never change once complete.
const FIRST_SEASON = 2025
const SEASONS = Array.from({ length: SEASON - FIRST_SEASON + 1 }, (_, i) => FIRST_SEASON + i)

// Known results, checked by hand against the league's own pages and press, so a parse
// that crowns the wrong club fails the refresh instead of the archive.
const CHAMPIONS = { 2025: 'ROS', 2026: 'MIS' }

// Results the schedule pages leave out. The February 8, 2025 Laces vs. Vinyl game was
// canceled on game day for player health and safety and ruled a Laces forfeit (a Vinyl
// win, never replayed), per league president Alex Bazzell to CBS Sports. The league's
// schedule drops it, which leaves both clubs at 13 games, so it is declared here. It
// carries a winner and no score: the standings count the result but no points.
const FORFEITS = {
  2025: [
    {
      id: 'forfeit-2025-02-08-lac-vin',
      tip: '2025-02-08T19:00:00.000Z',
      timeTbd: true,
      canceled: true,
      seasonType: 'regular',
      home: 'VIN',
      away: 'LAC',
      venue: 'Sephora Arena',
      city: 'Miami',
      state: 'FL',
      broadcast: [],
      forfeit: 'VIN',
      note: 'Canceled for player health and safety; Laces forfeit',
    },
  ],
}


// ── Round labels → the family's seasonType/round fields ────────────────────────
const ROUNDS = { 'First Round': 'R1', Quarterfinals: 'R1', Semifinals: 'SF', Championship: 'Final' }
function phaseOf(label, id) {
  if (/^Game \d+$/.test(label || '')) return { seasonType: 'regular' }
  if (ROUNDS[label]) return { seasonType: 'playoffs', round: ROUNDS[label] }
  throw new Error(`/game/${id}: unknown round label "${label}"`)
}

// "Breanna Stewart" → "B. Stewart", the short form the cards print.
export const shortName = (name) => {
  const parts = name.split(' ')
  return parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

// Each club's top scorer, rebounder and passer, the way the WNBA sibling's cards show them.
function starsOf(box, game) {
  const out = []
  for (const team of [game.home, game.away]) {
    const played = (box[team] || []).filter((p) => !p.dnp)
    for (const [cat, key] of [['points', 'pts'], ['rebounds', 'reb'], ['assists', 'ast']]) {
      const best = played.reduce((a, p) => (a == null || p[key] > a[key] ? p : a), null)
      if (best) out.push({ cat, v: String(best[key]), who: shortName(best.name), team })
    }
  }
  return out
}

// Tip within this window of now: worth refetching on a normal refresh.
const NEAR_MS = { before: 12 * 3600e3, after: 4 * 86400e3 }

async function buildSeason(year, committed) {
  const list = parseSchedule(await getPage(`/schedule?season=${year}`), `/schedule?season=${year}`)
  const now = Date.now()
  const games = []
  const box = {}
  for (const s of list) {
    const old = committed.get(s.id)
    const oldBox = COMMITTED_BOX[s.id]
    const settled = old?.score && oldBox && s.final && old.score.join() === s.score.join()
    const near = old?.tip && Date.parse(old.tip) > now - NEAR_MS.before && Date.parse(old.tip) < now + NEAR_MS.after
    const labelChanged = old && !old.score && !s.final && old.when !== s.when
    if (settled) {
      games.push(old)
      box[s.id] = oldBox
      continue
    }
    if (old && !s.final && !FULL && !near && !labelChanged) {
      games.push(old)
      continue
    }
    const g = parseGame(await getPage(`/game/${s.id}`), s.id)
    if (g.away && (g.away !== s.away || g.home !== s.home))
      throw new Error(`/game/${s.id}: game page says ${g.away} at ${g.home}, schedule says ${s.away} at ${s.home}`)
    const rec = {
      id: s.id,
      tip: g.tip,
      ...(g.tbd ? { timeTbd: true } : {}),
      ...phaseOf(g.roundLabel, s.id),
      home: s.home,
      away: s.away,
      venue: g.venue,
      city: g.city,
      state: g.state,
      broadcast: g.broadcast,
      when: s.when, // the schedule's own tip text, kept only to notice it changing
    }
    if (s.final) {
      if (!g.score || g.score.join() !== s.score.join())
        throw new Error(`/game/${s.id}: game page score ${g.score} disagrees with the schedule's ${s.score}`)
      rec.score = s.score
      rec.line = g.line
      const parsed = parseBoxScore(await getPage(`/game/${s.id}/box-score`), s.id)
      for (const [team, idx] of [[s.home, 0], [s.away, 1]]) {
        if (parsed.team[team] !== s.score[idx])
          throw new Error(`/game/${s.id}/box-score: ${team} TEAM row says ${parsed.team[team]}, score is ${s.score[idx]}`)
      }
      const b = { ...parsed.players }
      const gaps = boxGaps(parsed)
      if (Object.keys(gaps).length) {
        b.gaps = gaps
        console.log(`  note: /game/${s.id}/box-score leaves out ${JSON.stringify(gaps)} points`)
      }
      box[s.id] = b
      rec.stars = starsOf(b, rec)
      delete rec.when
    }
    games.push(rec)
  }
  for (const f of FORFEITS[year] || []) {
    if (list.some((s) => s.id === f.id)) throw new Error(`${year}: ${f.id} is on the schedule now; drop the declared copy`)
    games.push(f)
  }
  games.sort((a, b) => a.tip.localeCompare(b.tip) || a.id.localeCompare(b.id))
  return { games, box }
}

// ── Checks on a whole season, before anything is written ───────────────────────
function checkSeason(year, games, complete) {
  const reg = games.filter((g) => g.seasonType === 'regular')
  const clubs = [...new Set(reg.flatMap((g) => [g.home, g.away]))].sort()
  const per = Object.fromEntries(clubs.map((c) => [c, 0]))
  for (const g of reg) (per[g.home]++, per[g.away]++)
  const counts = new Set(Object.values(per))
  // Every club plays the same number of regular-season games. A short read (a missed
  // page, a parse that skipped a day) breaks this before it can reach the table.
  if (counts.size !== 1) throw new Error(`${year}: uneven regular-season counts ${JSON.stringify(per)}`)
  const post = games.filter((g) => g.seasonType === 'playoffs')
  const final = post.filter((g) => g.round === 'Final')
  if (complete) {
    if (final.length !== 1 || !final[0].score) throw new Error(`${year}: no finished Championship game`)
    const [h, a] = final[0].score
    const champ = h > a ? final[0].home : final[0].away
    if (CHAMPIONS[year] && champ !== CHAMPIONS[year])
      throw new Error(`${year}: parsed champion ${champ}, known champion ${CHAMPIONS[year]}`)
    return { clubs, champion: champ, runnerUp: champ === final[0].home ? final[0].away : final[0].home }
  }
  return { clubs }
}

// ── Writers ────────────────────────────────────────────────────────────────────
const json = (x) => JSON.stringify(x)
const gameLines = (games) => games.map((g) => `  ${json(g)},`).join('\n')

function teamsModule(seasonsByClub) {
  const teams = CLUBS.filter((c) => seasonsByClub[c.abbr]).map((c) => ({
    abbr: c.abbr,
    slug: c.slug,
    name: c.name,
    displayName: c.name,
    color: c.color,
    altColor: c.altColor,
    seasons: seasonsByClub[c.abbr],
  }))
  return `// GENERATED by scripts/fetch-schedule.mjs; do not edit by hand.
// Source: ${SITE}/schedule (clubs by nickname; abbreviations and colors are ours)

export const SEASON = ${SEASON}

export const TEAMS = ${JSON.stringify(teams, null, 2)}

export const TEAM_BY_ABBR = Object.fromEntries(TEAMS.map((t) => [t.abbr, t]))

// The clubs in the current season (the archive can name a club that has since left).
export const ALL_ABBRS = TEAMS.filter((t) => t.seasons.includes(SEASON)).map((t) => t.abbr)
`
}

function scheduleModule(games) {
  return `// GENERATED by scripts/fetch-schedule.mjs; do not edit by hand.
// Source: ${SITE}/schedule?season=${SEASON} and ${SITE}/game/{id}

export const GAMES = [
${gameLines(games)}
]

// Games the league has announced without clubs yet (none so far: the playoff games are
// published only once the clubs are known).
export const PENDING = []

export const SEASON_TYPES = ['regular', 'playoffs']

export const PLAYOFF_ROUNDS = { R1: 'First Round', SF: 'Semifinals', Final: 'Championship' }
`
}

function historyModule(seasons) {
  const body = seasons
    .map(
      (s) => `  {
    year: ${s.year},
    label: "${s.year}",
    champion: "${s.champion}",
    runnerUp: "${s.runnerUp}",
    clubs: ${json(s.clubs)},
    games: [
${s.games.map((g) => `      ${json(g)},`).join('\n')}
    ],
  },`
    )
    .join('\n')
  return `// GENERATED by scripts/fetch-schedule.mjs; do not edit by hand.
// Source: ${SITE}/schedule?season={year} and ${SITE}/game/{id}

// Every completed season, newest first, with all of its games. A season is small (45 to
// 61 games), so the games are committed whole and the standings, bracket and leaders are
// derived at runtime by the same code the current season uses.
export const HISTORY = [
${body}
]

export const HISTORY_BY_YEAR = Object.fromEntries(HISTORY.map((s) => [s.year, s]))

export const HISTORY_YEARS = HISTORY.map((s) => s.year)
`
}

function boxModule(box) {
  const ids = Object.keys(box).sort()
  return `// GENERATED by scripts/fetch-schedule.mjs; do not edit by hand.
// Source: ${SITE}/game/{id}/box-score

// Player lines for every finished game in every season, keyed by game id, then club.
// The app imports this lazily (game detail, leaders, player pages), so the first paint
// does not wait for it.
export const BOX = {
${ids.map((id) => `  ${json(id)}: ${json(box[id])},`).join('\n')}
}
`
}

async function writeLogos(data) {
  const dir = join(ROOT, 'public/logos')
  await mkdir(dir, { recursive: true })
  // The site's crest file names carry a content hash, so read the current names off a
  // page rather than hardcoding them.
  const tree = await getPage('/clubs')
  const srcs = new Map()
  const { walk } = await import('./lib/rsc.mjs')
  for (const n of walk(tree)) {
    const src = n.props?.src?.src
    const m = typeof src === 'string' && /\/_next\/static\/media\/([a-z-]+)-x1300\.[0-9a-f]+\.png$/.exec(src)
    if (m) srcs.set(m[1], src)
  }
  for (const c of CLUBS) {
    const src = srcs.get(c.slug)
    if (!src) throw new Error(`/clubs: no crest found for ${c.name}`)
    await sleep(PAUSE_MS)
    countRequest()
    // Next.js's image endpoint serves the 1300px crest at 128px (~5KB).
    const res = await fetch(`${SITE}/_next/image?url=${encodeURIComponent(src)}&w=128&q=75`, { headers: { 'User-Agent': HEADERS['User-Agent'] } })
    if (!res.ok || !/image\/png/.test(res.headers.get('content-type') || ''))
      throw new Error(`crest ${c.slug}: HTTP ${res.status} ${res.headers.get('content-type')}`)
    await data.write(join(dir, `${c.slug}.png`), Buffer.from(await res.arrayBuffer()))
  }
}

async function main() {
  const data = createDataWriter(join(ROOT, 'src/data/meta.js'))
  const committed = new Map()
  for (const g of COMMITTED_GAMES) committed.set(g.id, g)
  for (const s of COMMITTED_HISTORY) for (const g of s.games || []) committed.set(g.id, g)

  const seasonsByClub = {}
  const archive = []
  let current
  const allBox = {}
  for (const year of SEASONS) {
    const { games, box } = await buildSeason(year, committed)
    Object.assign(allBox, box)
    const complete = year < SEASON
    const facts = checkSeason(year, games, complete)
    for (const c of facts.clubs) (seasonsByClub[c] ||= []).push(year)
    console.log(`${year}: ${games.length} games, ${games.filter((g) => g.score).length} final, ${facts.clubs.length} clubs${facts.champion ? `, champion ${facts.champion}` : ''}`)
    if (complete) archive.unshift({ year, ...facts, games })
    else current = games
  }

  const wrote = []
  const put = async (rel, content) => (await data.write(join(ROOT, rel), content)) && wrote.push(rel)
  await put('src/data/teams.js', teamsModule(seasonsByClub))
  await put('src/data/schedule.js', scheduleModule(current))
  await put('src/data/history.js', historyModule(archive))
  await put('src/data/boxscores.js', boxModule(allBox))
  if (WITH_LOGOS) await writeLogos(data)
  console.log(`${requestCount()} requests; changed: ${wrote.join(', ') || 'nothing'}${data.stampedAt ? `; stamped ${data.stampedAt}` : ''}`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
