import { describe, it, expect } from 'vitest'
import { buildHubFeed, HUB_FEED_VERSION } from '../src/utils/hubFeed.js'

const teams = [
  { abbr: 'MIS', slug: 'mist', name: 'Mist', displayName: 'Mist BC' },
  { abbr: 'PHA', slug: 'phantom', name: 'Phantom' },
]

describe('the hub feed', () => {
  it('flips the score into the hub order, and dates only an untimed game', () => {
    const feed = buildHubFeed({
      season: 2027,
      updatedAt: '2026-11-08T00:00:00.000Z',
      base: 'https://example.test/unr',
      teams,
      games: [
        { id: 'a', tip: '2027-01-09T00:00:00.000Z', seasonType: 'regular', home: 'MIS', away: 'PHA', score: [80, 74], broadcast: ['TNT'] },
        { id: 'b', tip: '2027-01-10T19:00:00.000Z', timeTbd: true, seasonType: 'playoffs', round: 'Final', home: 'PHA', away: 'MIS' },
        { id: 'c', tip: '2027-01-11T01:00:00.000Z', postponed: true, seasonType: 'regular', home: 'MIS', away: 'PHA', broadcast: [] },
        { id: 'd', tip: '2027-01-12T01:00:00.000Z', canceled: true, seasonType: 'regular', home: 'MIS', away: 'PHA' },
      ],
    })
    expect(feed).toMatchObject({ version: HUB_FEED_VERSION, season: 2027, updatedAt: '2026-11-08T00:00:00.000Z' })
    expect(feed.teams).toEqual([
      { abbr: 'MIS', name: 'Mist BC', logo: 'https://example.test/unr/logos/mist.png' },
      { abbr: 'PHA', name: 'Phantom', logo: 'https://example.test/unr/logos/phantom.png' },
    ])
    expect(feed.games).toEqual([
      { id: 'a', tip: '2027-01-09T00:00:00.000Z', home: 'MIS', away: 'PHA', postseason: false, score: [74, 80], broadcast: ['TNT'] },
      { id: 'b', tip: '2027-01-10T19:00:00.000Z', day: '2027-01-10', home: 'PHA', away: 'MIS', postseason: true, round: 'Final', broadcast: [] },
      { id: 'c', tip: '2027-01-11T01:00:00.000Z', home: 'MIS', away: 'PHA', postseason: false, postponed: true, broadcast: [] },
    ])
  })

  it('keeps a base that already ends in a slash', () => {
    const feed = buildHubFeed({ season: 2027, updatedAt: 'x', base: 'https://example.test/', teams, games: [] })
    expect(feed.teams[0].logo).toBe('https://example.test/logos/mist.png')
  })
})
