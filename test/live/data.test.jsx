// The refresh gate (`npm run test:data`): the REAL refreshed modules, no coverage
// threshold. Only things true on any day of any season belong here, so a refresh fails
// it only when the data is wrong or breaks a view.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GAMES } from '../../src/data/schedule.js'
import { HISTORY } from '../../src/data/history.js'
import { BOX } from '../../src/data/boxscores.js'
import { TEAMS, TEAM_BY_ABBR, SEASON } from '../../src/data/teams.js'
import { rankTable } from '../../src/utils/standings.js'
import { buildBracket } from '../../src/utils/bracket.js'
import App from '../../src/App.jsx'

const SEASONS = [{ year: SEASON, games: GAMES }, ...HISTORY]

describe('every game', () => {
  for (const s of SEASONS) {
    it(`${s.year}: has a real tip, known clubs, and a known phase`, () => {
      for (const g of s.games) {
        expect(Number.isNaN(Date.parse(g.tip)), g.id).toBe(false)
        expect(TEAM_BY_ABBR[g.home], g.id).toBeTruthy()
        expect(TEAM_BY_ABBR[g.away], g.id).toBeTruthy()
        expect(g.home).not.toBe(g.away)
        expect(['regular', 'playoffs']).toContain(g.seasonType)
        if (g.seasonType === 'playoffs') expect(['R1', 'SF', 'Final']).toContain(g.round)
        expect(new Date(g.tip).getUTCFullYear(), g.id).toBeGreaterThanOrEqual(s.year - 1)
      }
      expect(new Set(s.games.map((g) => g.id)).size).toBe(s.games.length)
    })

    it(`${s.year}: a played game's line score, box score, and score agree`, () => {
      for (const g of s.games.filter((x) => x.score)) {
        const sum = (a) => a.reduce((x, y) => x + y, 0)
        expect(sum(g.line.home), g.id).toBe(g.score[0])
        expect(sum(g.line.away), g.id).toBe(g.score[1])
        const b = BOX[g.id]
        expect(b, `${g.id} has no box score`).toBeTruthy()
        for (const [club, i] of [[g.home, 0], [g.away, 1]]) {
          const pts = b[club].reduce((a, p) => a + (p.pts || 0), 0) + (b.gaps?.[club] || 0)
          expect(pts, `${g.id} ${club}`).toBe(g.score[i])
        }
      }
    })

    // On November 8, 2026 a CI refresh got its tip clocks in Central time, which the parser
    // did not read: all 52 timed 2027 games were committed as "Time TBD", each with its
    // clock as the venue ("6:00 PM CT (7:00 PM ET)") and the venue as the city, and this
    // suite passed. A game is TBD only when the schedule's own label says so, and a place
    // is never a clock.
    it(`${s.year}: a TBD game has no tip label, and no place field holds a clock`, () => {
      const clock = /^\d{1,2}:\d{2} [AP]M\b/
      for (const g of s.games) {
        for (const f of ['venue', 'city', 'state']) expect(g[f] || '', `${g.id} ${f}`).not.toMatch(clock)
        if (g.state) expect(g.state, g.id).toMatch(/^[A-Z]{2}$/)
        if (g.timeTbd && g.when) expect(g.when, `${g.id} is TBD, but the schedule says ${g.when}`).not.toMatch(clock)
      }
    })

    it(`${s.year}: every club plays the same number of regular-season games`, () => {
      const per = {}
      for (const g of s.games.filter((x) => x.seasonType === 'regular' && !x.postponed))
        for (const c of [g.home, g.away]) per[c] = (per[c] || 0) + 1
      expect(new Set(Object.values(per)).size).toBe(1)
    })
  }
})

describe('the archive', () => {
  it('crowns the known champions, rebuilt from the games', () => {
    const known = { 2025: 'ROS', 2026: 'MIS' }
    for (const s of HISTORY) {
      const b = buildBracket(s.games, { year: s.year, clubs: s.clubs })
      expect(b.champion, String(s.year)).toBe(s.champion)
      if (known[s.year]) expect(s.champion).toBe(known[s.year])
      expect(b.rounds.flatMap((r) => r.slots).every((x) => !x.projected), String(s.year)).toBe(true)
    }
  })

  it('ranks every club in every season', () => {
    for (const s of HISTORY) expect(rankTable(s.games, { year: s.year, clubs: s.clubs })).toHaveLength(s.clubs.length)
  })

  it('names every club with a crest file', () => {
    for (const t of TEAMS) expect(t.slug).toMatch(/^[a-z-]+$/)
  })
})

describe('the app renders on the refreshed data', () => {
  for (const view of ['schedule', 'standings', 'playoffs', 'stats', 'history']) {
    it(`renders ${view}`, async () => {
      window.history.replaceState(null, '', `/?view=${view}&hide=0`)
      const { unmount } = render(<App />)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(String(SEASON))
      unmount()
    })
  }
})
