// The scraper's parsers against six league pages saved on November 7, 2026. They run
// offline, so a parser change is checked without touching the site, and a page format
// change shows up here first when the fixtures are refreshed:
//
//   cd test/fixtures/rsc && curl -s -A 'Mozilla/5.0' -H 'RSC: 1' \
//     'https://www.unrivaled.basketball/game/jx1ocoygd5a4' | gzip -9 > game-final.rsc.gz
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import { treeFromRsc, parseRows, resolve, walk, textOf } from '../scripts/lib/rsc.mjs'
import {
  parseSchedule,
  parseGame,
  parseBoxScore,
  boxGaps,
  tipFrom,
  channelOf,
  clubAbbr,
  sameWhen,
} from '../scripts/lib/unrivaled.mjs'
import { shortName } from '../scripts/fetch-schedule.mjs'

const page = (name) =>
  treeFromRsc(
    gunzipSync(readFileSync(join(import.meta.dirname, 'fixtures/rsc', `${name}.rsc.gz`))).toString('utf8')
  )

describe('the RSC tree', () => {
  it('follows row references, so text arrives in page order', () => {
    const rows = parseRows(
      '0:["$","div",null,{"children":["a","$1","$L2","$@3","$undefined"]}]\n1:"b"\n2:["$","span",null,{"children":"c"}]\n3:7\nI[1,[]]'
    )
    expect(textOf(resolve(rows, rows.get('0')))).toBe('abc7')
  })

  it('walks slot props, which carry page content in client components', () => {
    const rows = parseRows('0:["$","$L9",null,{"notFound":["$","p",null,{"children":"slot"}],"title":"x"}]')
    expect(textOf(resolve(rows, rows.get('0')))).toBe('slot')
  })

  it('refuses a payload with no root, or a reference cycle', () => {
    expect(() => treeFromRsc('1:"x"')).toThrow(/no root row/)
    const rows = parseRows('0:"$1"\n1:"$0"')
    expect(() => resolve(rows, rows.get('0'))).toThrow(/deeper than 500/)
  })

  it('walks nothing for a non-tree', () => {
    expect([...walk(null)]).toEqual([])
  })
})

describe('the schedule page', () => {
  const games = parseSchedule(page('schedule-2025'), '2025')

  it('reads every 2025 team game the league lists, and no 1-on-1 games', () => {
    // 41 regular-season games (the 42nd was a forfeit the page leaves out) plus three
    // playoff games.
    expect(games).toHaveLength(44)
  })

  it('reads away then home, and stores the score home-first', () => {
    // "Vinyl 54, Rose 62, final": the 2025 championship.
    expect(games.at(-1)).toEqual({ id: 'xydxurm98lce', away: 'VIN', home: 'ROS', final: true, score: [62, 54] })
  })

  it('reads an upcoming label, and refuses a label or a club it does not know', () => {
    const tree = (label) => ({
      type: 'root',
      props: {},
      kids: [{ type: 'a', props: { href: '/game/abcdefghijkl', 'aria-label': label }, kids: [] }],
    })
    expect(parseSchedule(tree('Mist vs Rose, 5:00 PM MST'), 'x')[0]).toMatchObject({
      away: 'MIS',
      home: 'ROS',
      final: false,
      when: '5:00 PM MST',
    })
    expect(() => parseSchedule(tree('Mist at Rose, delayed'), 'x')).toThrow(/label this parser does not know/)
    expect(() => parseSchedule(tree('Comets vs Rose, 5:00 PM MST'), 'x')).toThrow(/unknown club "Comets"/)
  })
})

describe('a game page', () => {
  it('reads the 2026 championship: clubs, line score, tip, venue, channels, round', () => {
    expect(parseGame(page('game-final'), 'jx1ocoygd5a4')).toEqual({
      id: 'jx1ocoygd5a4',
      away: 'MIS',
      home: 'PHA',
      line: { home: [24, 19, 19, 12], away: [24, 19, 25, 12] },
      score: [74, 80],
      tip: '2026-03-05T02:30:00.000Z', // 7:30 PM MST on March 4
      venue: 'Sephora Arena',
      city: 'Miami',
      state: 'FL',
      broadcast: ['TNT', 'truTV', 'HBO Max'],
      roundLabel: 'Championship',
    })
  })

  it('reads an upcoming game on the 2027 tour, with no score', () => {
    const g = parseGame(page('game-upcoming'), '2q7fjfhslf2f')
    expect(g).toMatchObject({
      tip: '2027-01-09T00:00:00.000Z',
      venue: 'TD Garden',
      city: 'Boston',
      state: 'MA',
      roundLabel: 'Game 1',
    })
    expect(g.score).toBeUndefined()
  })

  it('reads the tip of a West Coast game, whose second clock is PT', () => {
    // Saved November 8, 2026. Before the fix this page came back as tbd at 19:00 UTC.
    const g = parseGame(page('game-pt'), 'adp89x8e4pe4')
    expect(g).toMatchObject({ tip: '2027-01-09T04:30:00.000Z', venue: 'Intuit Dome', city: 'Inglewood' })
    expect(g.tbd).toBeUndefined()
  })

  it('keeps the day of a game with no tip time, at noon Arizona time, and flags it', () => {
    expect(parseGame(page('game-tbd'), 't16f8c1ja6jk')).toMatchObject({ tip: '2027-03-05T19:00:00.000Z', tbd: true })
  })

  // The page prints the tip in the VISITOR's zone. The fixtures were saved from Arizona
  // (MST); GitHub's CI sees Central time. On November 8, 2026 a CI refresh read every 2027
  // game as "Time TBD" with its clock stored as the venue. These are the same saved pages
  // with the labels CI received (copied from the data that refresh committed).
  const asSeenFrom = (name, from, to) => {
    const raw = gunzipSync(readFileSync(join(import.meta.dirname, 'fixtures/rsc', `${name}.rsc.gz`))).toString('utf8')
    expect(raw).toContain(from)
    return treeFromRsc(raw.replaceAll(from, to))
  }

  it('reads the same tip whatever zone the page was fetched from', () => {
    const ct = parseGame(asSeenFrom('game-upcoming', '5:00 PM MST', '6:00 PM CT'), '2q7fjfhslf2f')
    expect(ct).toMatchObject({ tip: '2027-01-09T00:00:00.000Z', venue: 'TD Garden', city: 'Boston', state: 'MA' })
    expect(ct.tbd).toBeUndefined()
    // A venue in the visitor's own zone gets one clock, with no parentheses.
    const pt = parseGame(asSeenFrom('game-pt', '9:30 PM MST (8:30 PM PT)', '8:30 PM PT'), 'adp89x8e4pe4')
    expect(pt).toMatchObject({ tip: '2027-01-09T04:30:00.000Z', venue: 'Intuit Dome', city: 'Inglewood' })
  })

  it('stops on a clock it cannot read, instead of storing it as the venue', () => {
    expect(() => parseGame(asSeenFrom('game-upcoming', '5:00 PM MST', '6:00 PM CST'), 'x')).toThrow(/cannot read the tip/)
    expect(() => parseGame(asSeenFrom('game-tbd', 'Time TBD', 'Time later'), 'x')).toThrow(/no tip time and no "to be set"/)
  })
})

describe('the tip clock', () => {
  it('reads MST as UTC-7 all year, checked against the ET clock', () => {
    // After DST began: 4:30 PM MST is 7:30 PM EDT, three hours apart.
    expect(tipFrom('Monday, March 17, 2025', '4:30 PM MST (7:30 PM ET)', 'x')).toBe('2025-03-17T23:30:00.000Z')
    expect(tipFrom('Friday, January 17, 2025', '12:00 PM MST (2:00 PM ET)', 'x')).toBe('2025-01-17T19:00:00.000Z')
  })

  it('reads a venue clock in any US zone, each in its own zone', () => {
    // The Intuit Dome opener, as the league printed it (checked November 8, 2026). It was
    // read as "Time TBD" while only ET was understood.
    expect(tipFrom('Friday, January 08, 2027', '9:30 PM MST (8:30 PM PT)', 'x')).toBe('2027-01-09T04:30:00.000Z')
    expect(tipFrom('Friday, January 08, 2027', '6:00 PM MST (7:00 PM CT)', 'x')).toBe('2027-01-09T01:00:00.000Z')
    expect(tipFrom('Friday, January 08, 2027', '6:00 PM MST (6:00 PM MT)', 'x')).toBe('2027-01-09T01:00:00.000Z')
    // After DST began PT is UTC-7, the same clock as MST.
    expect(tipFrom('Monday, March 15, 2027', '7:00 PM MST (7:00 PM PT)', 'x')).toBe('2027-03-16T02:00:00.000Z')
    expect(() => tipFrom('Friday, January 08, 2027', '9:30 PM MST (9:30 PM PT)', 'x')).toThrow(/MST and PT clocks disagree/)
  })

  it('reads a first clock in any US zone, across DST, with or without a venue clock', () => {
    // The labels GitHub's CI received for the 2027 opener night (Central time).
    expect(tipFrom('Friday, January 08, 2027', '6:00 PM CT (7:00 PM ET)', 'x')).toBe('2027-01-09T00:00:00.000Z')
    expect(tipFrom('Friday, January 08, 2027', '10:30 PM CT (8:30 PM PT)', 'x')).toBe('2027-01-09T04:30:00.000Z')
    expect(tipFrom('Friday, January 08, 2027', '8:00 PM CT', 'x')).toBe('2027-01-09T02:00:00.000Z')
    // After DST began on March 14, 2027, CT is UTC-5 and MST still UTC-7.
    expect(tipFrom('Monday, March 15, 2027', '9:00 PM CT (7:00 PM PT)', 'x')).toBe('2027-03-16T02:00:00.000Z')
    expect(tipFrom('Monday, March 15, 2027', '7:00 PM MST', 'x')).toBe('2027-03-16T02:00:00.000Z')
    expect(tipFrom('Monday, March 15, 2027', '10:00 PM ET', 'x')).toBe('2027-03-16T02:00:00.000Z')
    expect(tipFrom('Monday, March 15, 2027', '8:00 PM MT', 'x')).toBe('2027-03-16T02:00:00.000Z')
  })

  it('refuses clocks that disagree, or text it cannot read', () => {
    expect(() => tipFrom('Monday, March 17, 2025', '4:30 PM MST (6:30 PM ET)', 'x')).toThrow(/MST and ET clocks disagree/)
    expect(() => tipFrom('Friday, January 08, 2027', '9:30 PM MST (8:30 PM HT)', 'x')).toThrow(/cannot read the tip/)
    expect(() => tipFrom('March 17', '4:30 PM MST (7:30 PM ET)', 'x')).toThrow(/cannot read the tip/)
    expect(() => tipFrom('Monday, Marchember 17, 2025', '4:30 PM MST (7:30 PM ET)', 'x')).toThrow(/unknown month/)
  })
})

describe('channels', () => {
  it('names the partners, and keeps an unknown one by host', () => {
    expect(channelOf('https://www.tntdrama.com/unrivaled')).toBe('TNT')
    expect(channelOf('https://www.trutv.com/unrivaled')).toBe('truTV')
    expect(channelOf('https://www.hbomax.com/sports/unrivaled?utm_source=x')).toBe('HBO Max')
    expect(channelOf('https://www.peacocktv.com/x')).toBe('peacocktv.com')
    expect(channelOf('not a url')).toBeNull()
  })
})

describe('a box score', () => {
  it('reads both clubs, starters, DNPs, and the TEAM row', () => {
    const b = parseBoxScore(page('box-final'), 'jx1ocoygd5a4')
    expect(b.team).toEqual({ MIS: 80, PHA: 74 })
    const plum = b.players.PHA.find((p) => p.name === 'Kelsey Plum')
    expect(plum).toMatchObject({
      id: 'kelsey-plum-trxk8xrmxs29',
      jersey: '10',
      starter: true,
      pts: 40,
      fgm: 14,
      fga: 21,
      tpm: 6,
      tpa: 7,
      ftm: 3,
      fta: 4,
    })
    expect(b.players.PHA.find((p) => p.name === 'Aliyah Boston')).toEqual({
      id: expect.any(String),
      name: 'Aliyah Boston',
      jersey: '7',
      dnp: true,
    })
    expect(boxGaps(b)).toEqual({})
  })

  it('records the points a league box score leaves out', () => {
    // Four Laces players total 46; the TEAM row says 60.
    expect(boxGaps(parseBoxScore(page('box-gap'), '73tp1uzii8x2'))).toEqual({ LAC: 14 })
  })

  it('refuses a page that is not two tables', () => {
    expect(() => parseBoxScore(page('game-upcoming'), 'x')).toThrow(/expected 2 tables/)
  })
})

describe('names', () => {
  it('shortens a name to an initial and the rest', () => {
    expect(shortName('Breanna Stewart')).toBe('B. Stewart')
    expect(shortName('Betnijah Laney-Hamilton')).toBe('B. Laney-Hamilton')
    expect(shortName('Cher')).toBe('Cher')
  })

  it('knows every club the site names, and only those', () => {
    expect(clubAbbr('Lunar Owls', 'x')).toBe('LUN')
    expect(() => clubAbbr(undefined, 'x')).toThrow(/unknown club/)
  })
})

describe('the schedule label, compared across zones', () => {
  // CI committed "6:00 PM CT"; a refresh from Arizona reads "5:00 PM MST" for the same
  // game. Compared as text, every game looked changed and a local refresh refetched all 55.
  const opener = '2027-01-09T00:00:00.000Z'
  it('treats one time in two zones as the same label', () => {
    expect(sameWhen('6:00 PM CT', '5:00 PM MST', opener)).toBe(true)
    expect(sameWhen('6:00 PM CT', '7:00 PM ET', opener)).toBe(true)
    expect(sameWhen('10:30 PM CT', '9:30 PM MST', opener)).toBe(true) // 04:30 UTC, past midnight
    // After DST: CT is UTC-5, MST still UTC-7, so they are two hours apart.
    expect(sameWhen('9:00 PM CT', '7:00 PM MST', '2027-03-16T02:00:00.000Z')).toBe(true)
    expect(sameWhen('tip time to be set', 'tip time to be set', opener)).toBe(true)
  })

  it('sees a real change, and a time set or unset', () => {
    expect(sameWhen('6:00 PM CT', '6:00 PM MST', opener)).toBe(false)
    expect(sameWhen('tip time to be set', '5:00 PM MST', opener)).toBe(false)
    expect(sameWhen('5:00 PM MST', 'tip time to be set', opener)).toBe(false)
    expect(sameWhen(undefined, '5:00 PM MST', opener)).toBe(false)
    expect(sameWhen('6:00 PM CT', '5:00 PM MST', undefined)).toBe(false)
  })
})
