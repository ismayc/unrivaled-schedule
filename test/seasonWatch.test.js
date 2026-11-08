// The new-season watch's logic (scripts/lib/season-watch.mjs), offline. The fetching half,
// scripts/check-new-season.mjs, is pinned by test/guards.test.js.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import { treeFromRsc, parseRows, resolve } from '../scripts/lib/rsc.mjs'
import { seasonsOf, clubCounts, seasonDone, judge } from '../scripts/lib/season-watch.mjs'

const page = (name) =>
  treeFromRsc(gunzipSync(readFileSync(join(import.meta.dirname, 'fixtures/rsc', `${name}.rsc.gz`))).toString('utf8'))

const game = (away, home) => ({ away, home })
// A full round robin: every club meets every other club `times` times.
const roundRobin = (clubs, times = 1) =>
  clubs.flatMap((a, i) => clubs.slice(i + 1).flatMap((b) => Array.from({ length: times }, () => game(a, b))))
const EIGHT = ['BRE', 'HIV', 'LAC', 'LUN', 'MIS', 'PHA', 'ROS', 'VIN']

describe('the season picker', () => {
  it('reads the listed seasons and the season shown, off a real schedule page', () => {
    // Saved November 7, 2026 from /schedule?season=2025.
    expect(seasonsOf(page('schedule-2025'), 'x')).toEqual({ years: [2027, 2026, 2025], shown: 2025 })
  })

  it('throws when the picker is gone, so a site change is a red run and not a quiet "not yet"', () => {
    const rows = parseRows('0:["$","div",null,{"children":"no picker"}]')
    const tree = { type: 'root', props: {}, kids: [resolve(rows, rows.get('0'))] }
    expect(() => seasonsOf(tree, '/schedule')).toThrow(/no season picker/)
  })
})

describe('the verdict', () => {
  const full = roundRobin(EIGHT, 2) // 56 games, 14 a club: the 2027 shape
  const base = { next: 2028, floor: 50, committedDone: true }

  it('says not yet while the picker does not list the season', () => {
    // The trap this guards: `?season=2028` answers with 2027's 56 games, so a verdict
    // built on the game count alone would report a release that has not happened.
    const v = judge({ ...base, listed: false, games: full })
    expect(v).toMatchObject({ released: false, partial: false, ready: false, count: 0 })
    expect(v.summary).toMatch(/does not list 2028/)
  })

  it('drafts the PR for a complete release once the committed season is final', () => {
    const v = judge({ ...base, listed: true, games: full })
    expect(v).toMatchObject({ released: true, partial: false, ready: true, count: 56 })
    expect(v.summary).toBe('2028 schedule is OUT: 56 games, 8 clubs.')
  })

  it('files the issue but holds the PR while the committed season is still being played', () => {
    const v = judge({ ...base, listed: true, games: full, committedDone: false })
    expect(v).toMatchObject({ released: true, partial: false, ready: false })
    expect(v.summary).toMatch(/not finished yet/)
  })

  it('calls a short, uneven, empty, or unreadable release partial', () => {
    const short = judge({ ...base, listed: true, games: roundRobin(EIGHT, 1) })
    expect(short).toMatchObject({ released: true, partial: true, ready: false, count: 28 })
    expect(short.summary).toMatch(/28 games, and a complete release is at least 50/)

    const uneven = judge({ ...base, listed: true, games: [...full, game('BRE', 'HIV')] })
    expect(uneven.partial).toBe(true)
    expect(uneven.summary).toMatch(/uneven game counts/)

    expect(judge({ ...base, listed: true, games: [] }).summary).toMatch(/no games are posted/)

    const odd = judge({ ...base, listed: true, problem: 'unknown club "Comets"' })
    expect(odd).toMatchObject({ released: true, partial: true, ready: false })
    expect(odd.summary).toMatch(/could not be read \(unknown club "Comets"\)/)
  })

  it('counts each club once per game, and finds a finished Championship', () => {
    expect(clubCounts([game('MIS', 'ROS'), game('ROS', 'VIN')])).toEqual({ MIS: 1, ROS: 2, VIN: 1 })
    expect(seasonDone([{ round: 'Final', score: [70, 64] }])).toBe(true)
    expect(seasonDone([{ round: 'Final' }, { round: 'SF', score: [1, 0] }])).toBe(false)
  })
})
