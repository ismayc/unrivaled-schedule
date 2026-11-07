import { describe, it, expect, vi, afterEach } from 'vitest'
import { GAMES } from '../src/data/schedule.js'
import {
  detectTimezone,
  timezoneOptions,
  formatTime,
  formatDate,
  formatStamp,
  formatZoneAbbr,
  dayKey,
  todayKey,
  gameDayKey,
  gameTime,
  gameCountdown,
  dayLabel,
  liveState,
  whenBucket,
  isUpNext,
  countdown,
  isImminent,
  anyImminent,
  IMMINENT_MS,
} from '../src/utils/time.js'
import { readState, toSearch, writeState, isValidZone, DEFAULTS } from '../src/utils/urlState.js'
import { parseQuery, matchesSearch } from '../src/utils/search.js'
import { SERVICE_CATALOG, SERVICE_BY_KEY, watchableServices, broadcastNotBadged } from '../src/utils/watch.js'
import { netClass, signed, barMax } from '../src/utils/format.js'
import { buildIcs, fold, escapeText, toIcsDate, downloadIcs, webcalUrl, googleCalendarUrl } from '../src/utils/ics.js'
import calendar from '../netlify/functions/calendar.mjs'

afterEach(() => vi.useRealTimers())

const g = (over = {}) => ({
  id: 'x1',
  tip: '2027-01-20T00:30:00.000Z',
  seasonType: 'regular',
  home: 'MIS',
  away: 'ROS',
  venue: 'Sephora Arena',
  city: 'Miami',
  state: 'FL',
  broadcast: ['TNT', 'HBO Max'],
  ...over,
})

describe('time', () => {
  it('detects the zone, and falls back to Eastern when Intl throws', () => {
    expect(detectTimezone()).toBe('UTC')
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl')
    })
    expect(detectTimezone()).toBe('America/New_York')
    spy.mockRestore()
    const empty = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({ resolvedOptions: () => ({}) }))
    expect(detectTimezone()).toBe('America/New_York')
    empty.mockRestore()
  })

  it('offers the known zones, plus an unknown current one first', () => {
    expect(timezoneOptions('America/Phoenix')[0].id).toBe('America/New_York')
    expect(timezoneOptions('Asia/Kolkata')[0]).toEqual({ id: 'Asia/Kolkata', label: 'Kolkata' })
  })

  it('formats tips, dates, stamps, and zones in the chosen zone', () => {
    const iso = '2027-01-20T00:30:00.000Z'
    expect(formatTime(iso, 'America/Phoenix')).toBe('5:30 PM')
    expect(formatDate(iso, 'America/Phoenix')).toBe('Tue, Jan 19')
    expect(formatStamp(iso, 'UTC')).toBe('Jan 20, 12:30 AM')
    expect(formatStamp(null, 'UTC')).toBeNull()
    expect(formatStamp('nonsense', 'UTC')).toBeNull()
    expect(formatZoneAbbr(iso, 'America/Phoenix')).toBe('MST')
    expect(dayKey(iso, 'America/Phoenix')).toBe('2027-01-19')
    expect(todayKey('UTC', new Date(iso))).toBe('2027-01-20')
  })

  it('buckets a game with no tip time on its Eastern day and prints no clock', () => {
    const tbd = g({ tip: '2027-03-05T19:00:00.000Z', timeTbd: true })
    expect(gameDayKey(tbd, 'Australia/Sydney')).toBe('2027-03-05')
    expect(gameTime(tbd, 'UTC')).toBe('Time TBD')
    expect(gameCountdown(tbd, 0)).toBeNull()
    expect(liveState(tbd, Date.parse('2027-03-05T20:00:00Z'))).toBe('upcoming')
    expect(isImminent(tbd, Date.parse('2027-03-05T19:00:00Z'))).toBe(false)
    expect(gameTime(g(), 'UTC')).toBe('12:30 AM')
    expect(gameCountdown(g(), Date.parse('2027-01-19T00:30:00Z'))).toBe('1d 0h')
  })

  it('labels today, tomorrow, yesterday, and other days', () => {
    const now = new Date('2027-01-20T12:00:00Z')
    expect(dayLabel('2027-01-20', 'UTC', now)).toBe('Today')
    expect(dayLabel('2027-01-21', 'UTC', now)).toBe('Tomorrow')
    expect(dayLabel('2027-01-19', 'UTC', now)).toBe('Yesterday')
    expect(dayLabel('2027-01-25', 'UTC', now)).toBe('Monday, January 25')
  })

  it('reads a game as upcoming, in progress, past, final, or void', () => {
    const tip = Date.parse(g().tip)
    expect(liveState(g(), tip - 1)).toBe('upcoming')
    expect(liveState(g(), tip + 60_000)).toBe('likely-live')
    expect(liveState(g(), tip + 3 * 3600e3)).toBe('past')
    expect(liveState(g({ score: [70, 60] }))).toBe('final')
    expect(liveState(g({ live: true }))).toBe('live')
    expect(liveState(g({ postponed: true }))).toBe('void')
    expect(liveState(g({ canceled: true }))).toBe('void')
    expect(whenBucket(g(), tip + 60_000)).toBe('live')
    expect(whenBucket(g({ live: true }))).toBe('live')
    expect(whenBucket(g(), tip - 1)).toBe('upcoming')
    expect(whenBucket(g({ canceled: true }))).toBe('void')
    expect(whenBucket(g({ score: [1, 0] }))).toBe('final')
  })

  it('knows each club’s next unplayed game', () => {
    const a = g({ id: 'a', tip: '2027-01-20T00:00:00Z' })
    const b = g({ id: 'b', tip: '2027-01-22T00:00:00Z', home: 'VIN', away: 'ROS' })
    const c = g({ id: 'c', tip: '2027-01-21T00:00:00Z', home: 'VIN', away: 'HIV' })
    const played = g({ id: 'p', tip: '2027-01-01T00:00:00Z', score: [1, 0] })
    const off = g({ id: 'o', tip: '2027-01-01T00:00:00Z', postponed: true })
    const all = [played, off, a, b, c]
    expect(isUpNext(a, all)).toBe(true)
    expect(isUpNext(b, all)).toBe(false)
    expect(isUpNext(c, all)).toBe(true)
    expect(isUpNext(played, all)).toBe(false)
    expect(isUpNext(null, all)).toBe(false)
  })

  it('counts down in days, hours, and minutes, and stops at the tip', () => {
    const t = Date.parse('2027-01-20T00:00:00Z')
    expect(countdown('2027-01-20T00:00:00Z', t)).toBeNull()
    expect(countdown('2027-01-20T00:00:00Z', t - 90 * 60e3)).toBe('1h 30m')
    expect(countdown('2027-01-20T00:00:00Z', t - 5 * 60e3)).toBe('5m')
  })

  it('treats a game as imminent from 15 minutes before tip until it would be over', () => {
    const tip = Date.parse(g().tip)
    expect(isImminent(g(), tip - IMMINENT_MS)).toBe(true)
    expect(isImminent(g(), tip - IMMINENT_MS - 1)).toBe(false)
    expect(isImminent(g({ score: [1, 0] }), tip)).toBe(false)
    expect(anyImminent([g()], tip)).toBe(true)
  })
})

describe('the URL state', () => {
  it('reads every field, rejecting an unknown view, zone, or season', () => {
    expect(readState('?view=history&tz=America/Phoenix&team=MIS&hide=0&mine=1&past=1&season=2025&game=abc')).toEqual({
      view: 'history',
      tz: 'America/Phoenix',
      team: 'MIS',
      game: 'abc',
      hide: false,
      hideExplicit: true,
      mine: true,
      past: true,
      pastExplicit: true,
      season: 2025,
    })
    expect(readState('?view=week&tz=Mars/Base&season=20')).toMatchObject({ view: 'schedule', tz: null, season: null, hide: true })
    expect(readState()).toMatchObject(DEFAULTS)
    expect(isValidZone('')).toBe(false)
  })

  it('writes only what differs from the defaults', () => {
    expect(toSearch({ ...DEFAULTS, tz: 'UTC' }, 'UTC')).toBe('')
    expect(toSearch({ view: 'stats', tz: 'UTC', team: 'ROS', hide: false, mine: true, past: true, season: 2026 }, 'America/Phoenix')).toBe(
      '?view=stats&tz=UTC&team=ROS&hide=0&mine=1&past=1&season=2026'
    )
    writeState({ view: 'standings' }, 'UTC')
    expect(window.location.search).toBe('?view=standings')
    writeState(DEFAULTS, 'UTC')
  })
})

describe('search', () => {
  it('splits scoped fields from free text, treating an unknown field as free text', () => {
    expect(parseQuery('')).toEqual({ free: '', tokens: [] })
    expect(parseQuery('rose team: mist tv: tnt bogus: thing')).toEqual({
      free: 'rose thing',
      tokens: [
        { field: 'team', value: 'mist' },
        { field: 'broadcast', value: 'tnt' },
      ],
    })
    expect(parseQuery(undefined)).toEqual({ free: '', tokens: [] })
    expect(parseQuery('mist bogus:')).toEqual({ free: 'mist', tokens: [] })
  })

  it('matches by club, city, venue, channel, and free text', () => {
    const m = (q, game = g()) => matchesSearch(game, parseQuery(q))
    expect(m('team: MIS')).toBe(true)
    expect(m('team: rose')).toBe(true)
    expect(m('team: vinyl')).toBe(false)
    expect(m('city: miami')).toBe(true)
    expect(m('city: miami', g({ city: undefined }))).toBe(false)
    expect(m('venue: sephora')).toBe(true)
    expect(m('venue: sephora', g({ venue: undefined }))).toBe(false)
    expect(m('tv: hbo')).toBe(true)
    expect(m('tv: hbo', g({ broadcast: undefined }))).toBe(false)
    expect(m('arena')).toBe(true)
    expect(m('boston')).toBe(false)
    expect(m('boston', g({ city: undefined, venue: undefined }))).toBe(false)
  })
})

describe('services', () => {
  it('matches HBO Max by name and the bundles through TNT and truTV', () => {
    expect(watchableServices(['HBO Max'], ['hbomax', 'youtubetv']).map((s) => s.key)).toEqual(['hbomax'])
    expect(watchableServices(['trutv', 'HBO Max'], ['youtubetv', 'sling']).map((s) => s.key)).toEqual(['youtubetv', 'sling'])
    expect(watchableServices([], ['hbomax'])).toEqual([])
    expect(watchableServices(['TNT'], [])).toEqual([])
    expect(SERVICE_BY_KEY.cable.label).toBe('Cable / Satellite')
    expect(SERVICE_CATALOG[0].key).toBe('hbomax')
  })

  it('drops a channel already shown as a badge', () => {
    expect(broadcastNotBadged(['TNT', 'HBO Max'], [SERVICE_BY_KEY.hbomax])).toEqual(['TNT'])
    expect(broadcastNotBadged(['TNT'], undefined)).toEqual(['TNT'])
    expect(broadcastNotBadged([], [])).toEqual([])
  })

})

describe('number formats', () => {
  it('classes, signs, and scales figures', () => {
    expect([netClass(2), netClass(-2), netClass(0)]).toEqual(['pos', 'neg', ''])
    expect([signed(1.25), signed(-1), signed(0)]).toEqual(['+1.3', '-1.0', '0.0'])
    expect([barMax([0, 0]), barMax([-3, 2]), barMax([])]).toEqual([1, 3, 1])
  })
})

describe('the calendar export', () => {
  it('writes timed, all-day, scored, canceled, and playoff events', () => {
    const ics = buildIcs(
      [
        g({ score: [80, 70], note: 'Opener' }),
        g({ id: 't', timeTbd: true, tip: '2027-03-05T19:00:00.000Z', broadcast: [] }),
        g({ id: 'c', canceled: true, venue: undefined, city: undefined, state: undefined }),
        g({ id: 'p', seasonType: 'playoffs', round: 'Final' }),
      ],
      { now: '2027-01-01T00:00:00.000Z' }
    )
    expect(ics).toContain('X-WR-CALNAME:Unrivaled')
    expect(ics).toContain('SUMMARY:Rose at Mist (70–80)')
    expect(ics).toContain('DTSTART;VALUE=DATE:20270305')
    expect(ics).toContain('DTSTART:20270120T003000Z')
    expect(ics).toContain('UID:x1@the-unrivaled-schedule')
    expect(ics).toContain('STATUS:CANCELLED')
    expect(ics).toContain('Playoffs: Championship')
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(buildIcs([])).toContain('BEGIN:VCALENDAR')
  })

  it('escapes, folds, and dates per RFC 5545', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
    expect(escapeText()).toBe('')
    expect(toIcsDate('2027-01-20T00:30:00.000Z')).toBe('20270120T003000Z')
    const long = 'X'.repeat(74) + 'é'.repeat(40)
    const folded = fold(long)
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(long)
    expect(fold('short')).toBe('short')
  })

  it('downloads a file and builds subscription links', () => {
    vi.useFakeTimers()
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadIcs([g()])
    expect(click).toHaveBeenCalled()
    vi.runAllTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
    click.mockRestore()
    expect(webcalUrl('https://a.b/c.ics')).toBe('webcal://a.b/c.ics')
    expect(googleCalendarUrl('https://a.b/c.ics')).toBe('https://www.google.com/calendar/render?cid=webcal://a.b/c.ics')
  })
})

describe('the calendar feed function', () => {
  it('serves the committed season, filtered to clubs when asked', async () => {
    const all = await calendar(new Request('https://x.netlify.app/calendar.ics'))
    expect(all.headers.get('Content-Type')).toContain('text/calendar')
    const body = await all.text()
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(GAMES.length)
    expect(body).toContain('X-WR-CALNAME:Unrivaled 2027')
    const mine = await (await calendar(new Request('https://x.netlify.app/calendar.ics?teams=mis, ,ros'))).text()
    const n = GAMES.filter((x) => ['MIS', 'ROS'].includes(x.home) || ['MIS', 'ROS'].includes(x.away)).length
    expect(mine.match(/BEGIN:VEVENT/g)).toHaveLength(n)
    expect(mine).toContain('My Clubs')
  })
})
