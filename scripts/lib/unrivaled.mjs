// Parsers for the three unrivaled.basketball pages the viewer is built from. Node
// built-ins only. Each takes the plain tree from rsc.mjs and returns data, or throws with
// the page and the part it could not read: a quiet partial read is how a scraper ships a
// wrong table, so anything unexpected stops the refresh instead.
//
//   /schedule?season=YYYY      every game of a season: id, clubs, score or tip label
//   /game/{id}                 date and tip, venue, channels, line score, round label
//   /game/{id}/box-score       one table of player lines per club
//
// Facts checked against the live pages on November 7, 2026:
//   - Order is away then home everywhere: the schedule's "Mist vs Phantom" marks Phantom
//     with the home class, and the game page labels Mist's crest "Away Team Logo".
//   - Tip times print in MST all year, with ET in parentheses, so MST is Arizona's fixed
//     UTC-7 (the March 17, 2025 final reads "4:30 PM MST (7:30 PM ET)", after DST began).
//   - Free throws can be worth 1, 2 or 3 points in this league, so a player's points are
//     read from the PTS column and never rebuilt from makes.

import { walk, textOf, elementKids, hasClass } from './rsc.mjs'

export const SITE = 'https://www.unrivaled.basketball'

// ── Clubs ─────────────────────────────────────────────────────────────────────
// The site names clubs only by nickname. Abbreviations and colors are ours (colors read
// off each crest); `slug` is the site's own, used in its logo file names.
export const CLUBS = [
  { abbr: 'BRE', name: 'Breeze', slug: 'breeze', color: '#4a3a78', altColor: '#c8327a' },
  { abbr: 'HIV', name: 'Hive', slug: 'hive', color: '#e0a91c', altColor: '#3c4248' },
  { abbr: 'LAC', name: 'Laces', slug: 'laces', color: '#4f9a88', altColor: '#d9898f' },
  { abbr: 'LUN', name: 'Lunar Owls', slug: 'lunar-owls', color: '#3d2f86', altColor: '#f2e07e' },
  { abbr: 'MIS', name: 'Mist', slug: 'mist', color: '#0b2f5c', altColor: '#a6d4e4' },
  { abbr: 'PHA', name: 'Phantom', slug: 'phantom', color: '#1b1b1b', altColor: '#e6e6e6' },
  { abbr: 'ROS', name: 'Rose', slug: 'rose', color: '#12504a', altColor: '#d6a08f' },
  { abbr: 'VIN', name: 'Vinyl', slug: 'vinyl', color: '#7f0f35', altColor: '#6fc6d4' },
]
const ABBR_BY_NAME = Object.fromEntries(CLUBS.map((c) => [c.name, c.abbr]))

export function clubAbbr(name, where) {
  const abbr = ABBR_BY_NAME[name?.trim()]
  if (!abbr) throw new Error(`${where}: unknown club "${name}". A new club needs a CLUBS entry.`)
  return abbr
}

// ── Schedule page ─────────────────────────────────────────────────────────────
const FINAL_LABEL = /^(.+?) (\d+), (.+?) (\d+), final\. Box score$/
const UPCOMING_LABEL = /^(.+?) vs (.+?), (.+)$/

// One entry per game link that carries an aria-label (each game also has a plain
// "Box score" link, which has none). 1-on-1 tournament links are under /1-on-1/ and are
// not team games, so the /game/ pattern leaves them out.
export function parseSchedule(tree, where) {
  const games = new Map()
  for (const n of walk(tree)) {
    const href = typeof n.props.href === 'string' ? n.props.href : ''
    const m = /^\/game\/([a-z0-9]{12})(?:\/box-score)?$/.exec(href)
    const label = n.props['aria-label']
    if (!m || typeof label !== 'string' || games.has(m[1])) continue
    const id = m[1]
    let f
    if ((f = FINAL_LABEL.exec(label))) {
      games.set(id, {
        id,
        away: clubAbbr(f[1], `${where} ${id}`),
        home: clubAbbr(f[3], `${where} ${id}`),
        final: true,
        score: [Number(f[4]), Number(f[2])], // [home, away], the family's order
      })
    } else if ((f = UPCOMING_LABEL.exec(label))) {
      games.set(id, {
        id,
        away: clubAbbr(f[1], `${where} ${id}`),
        home: clubAbbr(f[2], `${where} ${id}`),
        final: false,
        when: f[3],
      })
    } else {
      throw new Error(`${where}: game ${id} has a label this parser does not know: "${label}"`)
    }
  }
  return [...games.values()]
}

// ── Game page ─────────────────────────────────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December']
const DATE_RE = /^(?:Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day, (\w+) (\d{1,2}), (\d{4})$/
// The parenthesized clock is the venue's local zone, not always Eastern: a game at the
// Intuit Dome or Chase Center prints "9:30 PM MST (8:30 PM PT)". Until November 8, 2026
// only ET was read, and eight 2027 West Coast games fell through to "Time TBD".
const TIME_RE = /^(\d{1,2}):(\d{2}) ([AP]M) MST \((\d{1,2}):(\d{2}) ([AP]M) (ET|CT|MT|PT)\)$/
const ZONES = { ET: 'America/New_York', CT: 'America/Chicago', MT: 'America/Denver', PT: 'America/Los_Angeles' }
// Words the page uses for a tip time that is not announced yet. Anything else that is not
// a readable time is an error, never a silent "Time TBD".
const NO_TIME_RE = /to be set|TBD|TBA/i

const to24 = (h, ampm) => (Number(h) % 12) + (ampm === 'PM' ? 12 : 0)

// The UTC offset of an IANA zone at a UTC instant, in minutes (New York: -240 or -300).
function offsetMinutes(zone, ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, timeZoneName: 'shortOffset',
  }).formatToParts(new Date(ms))
  const m = /GMT([+-]\d+)/.exec(parts.find((p) => p.type === 'timeZoneName').value)
  return Number(m[1]) * 60
}

// "Wednesday, March 04, 2026" + "7:30 PM MST (9:30 PM ET)" → an ISO instant. The MST
// clock is UTC-7 all year; the local half is a cross-check in its own zone, so a page that
// ever switches to a DST-observing zone fails here instead of shifting every tip by an hour.
export function tipFrom(dateText, timeText, where) {
  const d = DATE_RE.exec(dateText)
  const t = TIME_RE.exec(timeText)
  if (!d || !t) throw new Error(`${where}: cannot read the tip from "${dateText}" / "${timeText}"`)
  const month = MONTHS.indexOf(d[1])
  if (month < 0) throw new Error(`${where}: unknown month "${d[1]}"`)
  const ms = Date.UTC(Number(d[3]), month, Number(d[2]), to24(t[1], t[3]) + 7, Number(t[2]))
  const local = new Date(ms + offsetMinutes(ZONES[t[7]], ms) * 60000)
  if (local.getUTCHours() !== to24(t[4], t[6]) || local.getUTCMinutes() !== Number(t[5]))
    throw new Error(`${where}: "${timeText}" is not MST (UTC-7) against the ${t[7]} clock`)
  return new Date(ms).toISOString()
}

// Where-to-watch links → channel names. A link we do not know is kept by host, so a new
// partner shows up in the data instead of vanishing.
const CHANNELS = [
  [/tntdrama\.com/, 'TNT'],
  [/trutv\.com/, 'truTV'],
  [/hbomax\.com|max\.com/, 'HBO Max'],
]
export function channelOf(href) {
  for (const [re, name] of CHANNELS) if (re.test(href)) return name
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

const findHeading = (tree, text) =>
  [...walk(tree)].find((n) => /^h[1-6]$/.test(n.type) && textOf(n).trim() === text)

// The innermost element that holds both `heading` and something after it: the section
// a heading titles.
function sectionOf(tree, heading) {
  let best = null
  for (const n of walk(tree)) if (n.kids.includes(heading)) best = n
  return best
}

export function parseGame(tree, id) {
  const where = `/game/${id}`
  const out = { id }

  // Line score: a table whose header row ends in "T". Rows: crest, club, periods, total.
  const lineTable = [...walk(tree)].find(
    (n) => n.type === 'table' && /^\d+T$|^(\d|OT)+T$/.test(textOf(elementKids(n)[0]).replace(/\s/g, ''))
  )
  if (lineTable) {
    const rows = [...walk(lineTable)].filter((n) => n.type === 'tr').slice(1)
    if (rows.length !== 2) throw new Error(`${where}: line score has ${rows.length} rows`)
    const read = (tr) => {
      const cells = elementKids(tr).map((c) => textOf(c).trim())
      return { club: cells[0], periods: cells.slice(1, -1).map(Number), total: Number(cells.at(-1)) }
    }
    const [away, home] = rows.map(read)
    const awayLogo = [...walk(rows[0])].some((n) => n.props.alt === 'Away Team Logo')
    if (!awayLogo) throw new Error(`${where}: the line score's first row is not the away club`)
    out.away = clubAbbr(away.club, where)
    out.home = clubAbbr(home.club, where)
    // Only a played game has numbers in it; an upcoming one prints dashes or nothing.
    if (away.periods.length && [...away.periods, ...home.periods, away.total, home.total].every(Number.isFinite)) {
      for (const side of [away, home]) {
        const sum = side.periods.reduce((a, b) => a + b, 0)
        if (sum !== side.total) throw new Error(`${where}: ${side.club} periods sum to ${sum}, total says ${side.total}`)
      }
      out.line = { home: home.periods, away: away.periods }
      out.score = [home.total, away.total]
    }
  }

  // Game Information: date, tip, venue, city, channels.
  const info = findHeading(tree, 'Game Information')
  if (!info) throw new Error(`${where}: no Game Information section`)
  const section = sectionOf(tree, info)
  const spans = [...walk(section)].filter((n) => n.type === 'span').map((n) => textOf(n).trim())
  const dateText = spans.find((s) => DATE_RE.test(s))
  const timeText = spans.find((s) => /MST|time to be set|TBD/i.test(s))
  if (!dateText) throw new Error(`${where}: no date in Game Information`)
  if (timeText && !NO_TIME_RE.test(timeText)) out.tip = tipFrom(dateText, timeText, where)
  else {
    // No tip time yet: keep the day, at noon Arizona time so it lands on the right
    // calendar day in every US zone, and flag it.
    const d = DATE_RE.exec(dateText)
    out.tip = new Date(Date.UTC(Number(d[3]), MONTHS.indexOf(d[1]), Number(d[2]), 19)).toISOString()
    out.tbd = true
  }
  const dateIdx = spans.indexOf(dateText)
  const venueIdx = spans.findIndex((s, i) => i > dateIdx && s !== timeText && !DATE_RE.test(s) && s !== 'Where to Watch')
  out.venue = spans[venueIdx] || null
  const place = (spans[venueIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean)
  out.city = place[0] || null
  out.state = place[1] || null
  out.broadcast = [...new Set(
    [...walk(section)].filter((n) => n.type === 'a' && typeof n.props.href === 'string')
      .map((n) => channelOf(n.props.href)).filter(Boolean)
  )]

  // The round label sits on this game's own entry in the Matchups list ("Game 2",
  // "Semifinals", "Championship").
  const entry = [...walk(tree)].find((n) => n.props.href === `/game/${id}` && hasClass(n, 'block'))
  if (entry) {
    const label = textOf([...walk(entry)].find((n) => n.type === 'span') || '').trim()
    out.roundLabel = label || null
  }
  return out
}

// ── Box score page ────────────────────────────────────────────────────────────
const NUM = (s) => (s === '' || s === '-' ? 0 : Number(s))
const PAIR = (s) => s.split('-').map(Number)

export function parseBoxScore(tree, id) {
  const where = `/game/${id}/box-score`
  const tables = [...walk(tree)].filter((n) => n.type === 'table')
  if (tables.length !== 2) throw new Error(`${where}: expected 2 tables, found ${tables.length}`)
  const clubs = [...walk(tree)].filter((n) => n.type === 'h4').map((n) => textOf(n).trim())
  const out = { players: {}, team: {} }
  tables.forEach((table, i) => {
    const rows = [...walk(table)].filter((n) => n.type === 'tr')
    const head = elementKids(rows[0]).map((c) => textOf(c).trim())
    const want = ['PLAYERS', 'MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'OREB', 'DREB', 'AST', 'STL', 'BLK', 'TO', 'PF', '+/-']
    if (head.join() !== want.join()) throw new Error(`${where}: columns changed: ${head.join(' ')}`)
    const players = []
    let team = null
    for (const tr of rows.slice(1)) {
      const cells = elementKids(tr)
      const first = textOf(cells[0]).trim()
      if (first === 'TEAM') {
        team = Number(textOf(cells[2]).trim())
        continue
      }
      const link = [...walk(cells[0])].find((n) => typeof n.props.href === 'string' && n.props.href.startsWith('/player/'))
      if (!link) continue // the shooting-percentage row under TEAM
      const nameSpan = [...walk(link)].find((n) => n.type === 'span')
      const bits = nameSpan.kids
      const starter = bits.some((b) => typeof b === 'object' && textOf(b).trim() === 'S')
      const name = bits.filter((b) => typeof b === 'string').join('').trim()
      const jersey = textOf(bits.find((b) => typeof b === 'object' && textOf(b).startsWith('#')) || '').replace('#', '').trim()
      const vals = cells.slice(1).map((c) => textOf(c).trim())
      const p = { id: link.props.href.slice('/player/'.length), name, jersey }
      if (starter) p.starter = true
      if (vals[0] === 'DNP' || vals.length < 14) {
        p.dnp = true
      } else {
        const [fgm, fga] = PAIR(vals[2])
        const [tpm, tpa] = PAIR(vals[3])
        const [ftm, fta] = PAIR(vals[4])
        Object.assign(p, {
          min: Number(vals[0]), pts: NUM(vals[1]), fgm, fga, tpm, tpa, ftm, fta,
          reb: NUM(vals[5]), oreb: NUM(vals[6]), dreb: NUM(vals[7]), ast: NUM(vals[8]),
          stl: NUM(vals[9]), blk: NUM(vals[10]), to: NUM(vals[11]), pf: NUM(vals[12]),
          pm: NUM(vals[13]),
        })
      }
      players.push(p)
    }
    const abbr = clubAbbr(clubs[i], where)
    if (team == null) throw new Error(`${where}: ${abbr} has no TEAM row`)
    out.players[abbr] = players
    out.team[abbr] = team
  })
  return out
}

// Points the league's own player rows leave out, per club: the TEAM row minus the sum of
// the players. Usually zero. On a few 2025 pages a player who scored is missing from the
// table (/game/73tp1uzii8x2: four Laces players total 46, the TEAM row says 60), so a
// gap is a fact about the source, recorded rather than thrown.
export function boxGaps(parsed) {
  const gaps = {}
  for (const [abbr, players] of Object.entries(parsed.players)) {
    const sum = players.reduce((a, p) => a + (p.pts || 0), 0)
    if (sum !== parsed.team[abbr]) gaps[abbr] = parsed.team[abbr] - sum
  }
  return gaps
}
