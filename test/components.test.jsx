// Each component on its own, for the paths the full-app tests do not reach.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, act, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GAMES } from '../src/data/schedule.js'
import { HISTORY } from '../src/data/history.js'
import { FollowProvider, useFollow } from '../src/context/follow.jsx'
import { ServicesProvider, useServices } from '../src/context/services.jsx'
import ScheduleView from '../src/components/ScheduleView.jsx'
import NextGame from '../src/components/NextGame.jsx'
import GameCard from '../src/components/GameCard.jsx'
import GameDetail from '../src/components/GameDetail.jsx'
import TeamPanel from '../src/components/TeamPanel.jsx'
import PlayerModal from '../src/components/PlayerModal.jsx'
import StatsView from '../src/components/StatsView.jsx'
import { StandingsTable } from '../src/components/StandingsView.jsx'
import Bracket from '../src/components/Bracket.jsx'
import HistoryView from '../src/components/HistoryView.jsx'
import CalendarModal from '../src/components/CalendarModal.jsx'
import ServicesModal from '../src/components/ServicesModal.jsx'
import TeamLogo from '../src/components/TeamLogo.jsx'
import FooterTimes from '../src/components/FooterTimes.jsx'
import { useBox, loadBox, resetBoxCache } from '../src/hooks/useBox.js'
import { CURRENT, seasonByYear } from '../src/utils/seasons.js'

const NOW = new Date('2027-02-09T20:00:00Z')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

const wrap = (ui) =>
  render(
    <FollowProvider>
      <ServicesProvider>{ui}</ServicesProvider>
    </FollowProvider>
  )
const s2025 = seasonByYear(2025)
const s2026 = seasonByYear(2026)
const upcoming = GAMES.filter((g) => !g.score && !g.timeTbd && !g.postponed)
const played = GAMES.filter((g) => g.score)

describe('ScheduleView', () => {
  it('shows a fortnight of game-days, with the rest behind Later games', async () => {
    const user = userEvent.setup()
    // Before the opener every game-day is upcoming, so more than a fortnight of them waits.
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'))
    render(<ScheduleView games={GAMES} tz="UTC" hideScores />)
    const later = screen.getByRole('button', { name: /Later games/ })
    const before = document.querySelectorAll('article.game').length
    await user.click(later)
    expect(document.querySelectorAll('article.game').length).toBeGreaterThan(before)
    await user.click(screen.getByRole('button', { name: /Later games/ }))
    expect(document.querySelectorAll('article.game').length).toBe(before)
  })

  it('folds a day and reveals one day’s scores', async () => {
    const user = userEvent.setup()
    render(<ScheduleView games={played.slice(-4)} tz="UTC" hideScores />)
    const day = document.querySelector('.day')
    const eye = within(day).getByTitle('Show scores for this day')
    await user.click(eye)
    expect(day.querySelector('.side-score')).not.toBeNull()
    await user.click(within(day).getByTitle('Hide scores for this day'))
    await user.click(within(day).getByRole('button', { name: /^Hide games on/ }))
    expect(day.querySelector('article')).toBeNull()
    await user.click(within(day).getByRole('button', { name: /^Show games on/ }))
    expect(day.querySelector('article')).not.toBeNull()
  })

  it('groups the full season into months with a jump bar', async () => {
    const user = userEvent.setup()
    const top = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<ScheduleView games={GAMES} tz="UTC" hideScores showPast />)
    const bar = screen.getByRole('navigation', { name: 'Jump to month' })
    await user.click(within(bar).getByRole('button', { name: 'Jan' }))
    expect(screen.getByRole('button', { name: /January 2027/ })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: /January 2027/ }))
    expect(screen.getByRole('button', { name: /January 2027/ })).toHaveAttribute('aria-expanded', 'false')
    await user.click(within(bar).getByRole('button', { name: 'Today' }))
    await user.click(within(bar).getByRole('button', { name: '↑ Top' }))
    expect(top).toHaveBeenCalled()
    fireEvent(window, new Event('resize'))
    top.mockRestore()
  })

  it('says when nothing matches, and falls back to the last week once the season is over', () => {
    const { unmount } = render(<ScheduleView games={[]} tz="UTC" />)
    expect(screen.getByText(/No games match/)).toBeInTheDocument()
    unmount()
    vi.setSystemTime(new Date('2027-06-01T00:00:00Z'))
    render(<ScheduleView games={played} tz="UTC" />)
    expect(document.querySelectorAll('.day').length).toBe(7)
    expect(screen.queryByRole('button', { name: /Later games/ })).toBeNull()
  })

  it('lands the full season on the last game-day when everything is past', () => {
    vi.setSystemTime(new Date('2027-06-01T00:00:00Z'))
    render(<ScheduleView games={played} tz="UTC" showPast />)
    expect(screen.getByRole('button', { name: /February 2027/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('counts one game in the singular', () => {
    render(<ScheduleView games={[upcoming[0]]} tz="UTC" showPast />)
    expect(screen.getByText('1 game', { selector: '.day-count' })).toBeInTheDocument()
    expect(screen.getByText('1 game', { selector: '.month-count' })).toBeInTheDocument()
  })
})

describe('NextGame', () => {
  const at = (g, mins) => vi.setSystemTime(new Date(Date.parse(g.tip) + mins * 60e3))

  it('counts down to a single next game, and jumps to its day', async () => {
    const user = userEvent.setup()
    const g = upcoming[0]
    at(g, -30)
    const el = document.createElement('div')
    el.id = `day-${new Date(g.tip).toISOString().slice(0, 10)}`
    el.scrollIntoView = vi.fn()
    document.body.appendChild(el)
    render(<NextGame games={[g]} tz="UTC" />)
    expect(screen.getByLabelText('time until tip')).toHaveTextContent(/30m0s/)
    await user.click(screen.getByRole('button', { name: /Jump to it/ }))
    expect(el.scrollIntoView).toHaveBeenCalled()
    el.remove()
    await user.click(screen.getByRole('button', { name: /Jump to it/ }))
  })

  it('shows days and hours far out, and hours and minutes inside a day', () => {
    const g = upcoming[0]
    at(g, -3 * 1440)
    const { unmount } = render(<NextGame games={[g]} tz="UTC" />)
    expect(screen.getByLabelText('time until tip')).toHaveTextContent(/3d0h/)
    unmount()
    at(g, -125)
    render(<NextGame games={[g]} tz="UTC" />)
    expect(screen.getByLabelText('time until tip')).toHaveTextContent(/2h5m/)
  })

  it('stacks games that share a tip, and prefers a followed club’s next game', async () => {
    const user = userEvent.setup()
    const a = upcoming[0]
    const b = { ...upcoming[1], tip: a.tip }
    const later = upcoming.find((g) => g.tip > a.tip && ![a.home, a.away, b.home, b.away].includes(g.home))
    at(a, -60 * 24)
    const Follow = () => {
      const { toggle } = useFollow()
      return <button onClick={() => toggle(later.home)}>follow</button>
    }
    wrap(
      <>
        <Follow />
        <NextGame games={[a, b, later]} tz="UTC" />
      </>
    )
    expect(screen.getByText('2 at once')).toBeInTheDocument()
    await user.click(document.querySelector('.nm-live-row'))
    await user.click(screen.getByRole('button', { name: 'follow' }))
    expect(screen.getByText(/Your next game/)).toBeInTheDocument()
  })

  it('shows games in progress, a followed club’s first', async () => {
    const user = userEvent.setup()
    const a = upcoming[0]
    const b = { ...upcoming[1], tip: a.tip }
    at(a, 10)
    const Follow = () => {
      const { toggle } = useFollow()
      return <button onClick={() => toggle(b.home)}>follow</button>
    }
    wrap(
      <>
        <Follow />
        <NextGame games={[a, b]} tz="UTC" />
      </>
    )
    expect(screen.getByText(/In progress/)).toHaveTextContent('2 games')
    await user.click(screen.getByRole('button', { name: 'follow' }))
    expect(screen.getByText('Score with the next refresh', { exact: false })).toBeInTheDocument()
  })

  it('names the playoffs, prints no clock for a game with no tip time, and says when the season is done', () => {
    const p = { ...upcoming[0], seasonType: 'playoffs' }
    at(p, -60)
    const { unmount } = render(<NextGame games={[p]} tz="UTC" />)
    expect(screen.getByText('Playoffs')).toBeInTheDocument()
    unmount()
    const tbd = GAMES.find((g) => g.timeTbd)
    vi.setSystemTime(new Date(Date.parse(tbd.tip) - 86400e3))
    const t = render(<NextGame games={[tbd, { ...tbd, id: 'twin' }]} tz="UTC" />)
    expect(screen.getAllByText(/Time TBD/)[0]).toBeInTheDocument()
    t.unmount()
    render(<NextGame games={played} tz="UTC" />)
    expect(screen.getByText(/No games left/)).toBeInTheDocument()
  })

  it('ticks while mounted', async () => {
    vi.useRealTimers()
    vi.useFakeTimers()
    const g = upcoming[0]
    vi.setSystemTime(new Date(Date.parse(g.tip) - 30 * 60e3))
    render(<NextGame games={[g]} tz="UTC" />)
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByLabelText('time until tip')).toHaveTextContent(/29m58s/)
  })
})

describe('GameCard', () => {
  it('opens on Enter and Space, and the star does not open it', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    wrap(<GameCard game={upcoming[0]} tz="UTC" onOpen={onOpen} />)
    const card = document.querySelector('article')
    card.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onOpen).toHaveBeenCalledTimes(2)
    const star = within(card).getAllByRole('button', { name: /^Follow/ })[0]
    star.focus()
    await user.keyboard('{Enter}')
    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(star).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('a')
  })

  it('shows in progress, postponed, canceled, imminent, and channel TBA', () => {
    const g = upcoming[0]
    vi.setSystemTime(new Date(Date.parse(g.tip) + 60e3))
    const { rerender } = wrap(<GameCard game={g} tz="UTC" />)
    expect(screen.getByText(/In progress/)).toBeInTheDocument()
    vi.setSystemTime(new Date(Date.parse(g.tip) - 60e3))
    rerender(
      <FollowProvider>
        <ServicesProvider>
          <GameCard game={{ ...g, broadcast: [] }} tz="UTC" />
          <GameCard game={{ ...g, id: 'pp', postponed: true }} tz="UTC" />
          <GameCard game={{ ...g, id: 'cc', canceled: true }} tz="UTC" />
          <GameCard game={{ ...g, id: 'nv', venue: undefined, city: undefined, broadcast: undefined }} tz="UTC" />
          <GameCard game={{ ...g, id: 'vo', city: undefined }} tz="UTC" />
        </ServicesProvider>
      </FollowProvider>
    )
    expect(screen.getAllByText('Pre-game').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Channel TBA').length).toBeGreaterThan(0)
    expect(screen.getByText('Postponed')).toBeInTheDocument()
    expect(screen.getByText('Canceled')).toBeInTheDocument()
    expect(screen.getAllByText(g.venue).length).toBeGreaterThan(0)
  })

  it('badges my services, and marks the winner of a played game', () => {
    localStorage.setItem('unr:services', JSON.stringify(['hbomax']))
    const g = played[0]
    wrap(<GameCard game={g} tz="UTC" hideScores={false} />)
    expect(screen.getByLabelText(/Watch on HBO Max/)).toBeInTheDocument()
    expect(document.querySelector('.side.winner')).not.toBeNull()
  })
})

describe('GameDetail', () => {
  const box2025 = s2025.games.find((g) => g.id === '73tp1uzii8x2')

  it('loads the box score, notes a gap in the league’s table, and shows service badges', async () => {
    localStorage.setItem('unr:services', JSON.stringify(['youtubetv']))
    resetBoxCache()
    wrap(<GameDetail game={box2025} tz="UTC" hideScores onClose={() => {}} />)
    expect(screen.getByText(/Loading box score/)).toBeInTheDocument()
    expect(await screen.findByText(/leaves out 14 of this club/)).toBeInTheDocument()
    expect(screen.getAllByText('Did not play').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText(/Watch on/)).toBeTruthy()
  })

  it('shows an upcoming game’s countdown, channel TBA, and note; a postponed game; and no box score', async () => {
    const user = userEvent.setup()
    const g = { ...upcoming[0], broadcast: [], note: 'Doubleheader' }
    const onPick = vi.fn()
    const onClose = vi.fn()
    const { rerender } = wrap(<GameDetail game={g} tz="UTC" onClose={onClose} onPickTeam={onPick} />)
    expect(screen.getByText(/^in /)).toBeInTheDocument()
    expect(screen.getByText('Channel TBA')).toBeInTheDocument()
    expect(screen.getByText('Doubleheader')).toBeInTheDocument()
    const btns = screen.getAllByRole('button', { name: /schedule$/ })
    await user.click(btns[1])
    expect(onPick).toHaveBeenCalledWith(g.home)
    fireEvent.mouseDown(document.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
    rerender(
      <FollowProvider>
        <ServicesProvider>
          <GameDetail game={{ ...g, postponed: true }} tz="UTC" onClose={() => {}} />
        </ServicesProvider>
      </FollowProvider>
    )
    expect(screen.getByText('Postponed')).toBeInTheDocument()
    rerender(
      <FollowProvider>
        <ServicesProvider>
          <GameDetail game={{ ...played[0], id: 'no-box', venue: undefined }} tz="UTC" onClose={() => {}} />
        </ServicesProvider>
      </FollowProvider>
    )
    expect(await screen.findByText(/No box score for this game/)).toBeInTheDocument()
  })

  it('shows a canceled forfeit, with the forfeit in the meetings and no league link', () => {
    const f = s2025.games.find((g) => g.forfeit)
    wrap(<GameDetail game={f} tz="UTC" onClose={() => {}} />)
    expect(screen.getByText('Canceled')).toBeInTheDocument()
    expect(screen.getByText('VIN by forfeit')).toBeInTheDocument()
    expect(screen.queryByText(/Game page on unrivaled/)).toBeNull()
  })

  it('hides the meetings’ scores in spoiler-free mode for the current season', () => {
    const g = played.find((x) => played.filter((y) => [y.home, y.away].sort().join() === [x.home, x.away].sort().join()).length > 1)
    wrap(<GameDetail game={g} tz="UTC" hideScores onClose={() => {}} />)
    expect(screen.getAllByText('—', { selector: '.drill-score' }).length).toBeGreaterThan(0)
    expect(screen.getByText('Final', { selector: '.md-state' })).toBeInTheDocument()
  })

  it('renders nothing with no game', () => {
    const { container } = wrap(<GameDetail game={null} tz="UTC" onClose={() => {}} />)
    expect(container.querySelector('.modal')).toBeNull()
  })
})

describe('TeamPanel', () => {
  it('lists a 2025 club’s forfeit, playoff games, and negative differential', async () => {
    const onClose = vi.fn()
    wrap(<TeamPanel abbr="LAC" season={s2025} tz="UTC" onClose={onClose} />)
    expect(screen.getByText('L (forfeit)')).toBeInTheDocument()
    expect(screen.getByText('Semifinals')).toBeInTheDocument()
    expect((await screen.findAllByText(/PTS · /)).length).toBeGreaterThan(0)
    fireEvent.mouseDown(document.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the forfeit as a win for the other side, and a negative net', () => {
    wrap(<TeamPanel abbr="VIN" season={s2025} tz="UTC" onClose={() => {}} />)
    expect(screen.getByText('W (forfeit)')).toBeInTheDocument()
    // 889 for and 956 against over the 13 games with points: -5.2 a game.
    expect(screen.getByText('-5.2')).toBeInTheDocument()
  })

  it('hides the current season’s record and results in spoiler-free mode', () => {
    wrap(<TeamPanel abbr="MIS" season={CURRENT} tz="UTC" hideScores onClose={() => {}} />)
    expect(screen.getByText(/record hidden/)).toBeInTheDocument()
    expect(screen.getAllByText('Final', { selector: '.drill-score' }).length).toBeGreaterThan(0)
  })

  it('renders nothing with no club', () => {
    const { container } = wrap(<TeamPanel abbr={null} season={CURRENT} tz="UTC" onClose={() => {}} />)
    expect(container.querySelector('.modal')).toBeNull()
  })
})

describe('PlayerModal', () => {
  it('lists every season a player played, and switches the game log', async () => {
    const user = userEvent.setup()
    wrap(<PlayerModal player={{ id: 'chelsea-gray-r6go6kmzp23j', name: 'Chelsea Gray' }} tz="UTC" onClose={() => {}} />)
    const rows = await screen.findAllByRole('button', { name: /^20\d\d$/ })
    expect(rows.map((r) => r.textContent)).toEqual(['2027', '2026', '2025'])
    await user.click(rows[2])
    expect(screen.getByText('2025 game log')).toBeInTheDocument()
  })

  it('hides the current season in spoiler-free mode, and handles a player with no games', async () => {
    const { unmount } = wrap(
      <PlayerModal player={{ id: 'chelsea-gray-r6go6kmzp23j', name: 'Chelsea Gray' }} tz="UTC" hideScores onClose={() => {}} />
    )
    expect(await screen.findByText(/Hidden in spoiler-free mode/)).toBeInTheDocument()
    expect(screen.queryByText('2027 game log')).toBeNull()
    unmount()
    wrap(<PlayerModal player={{ id: 'nobody', name: 'Nobody' }} tz="UTC" onClose={() => {}} />)
    expect(await screen.findByText(/No games played/)).toBeInTheDocument()
  })

  it('renders nothing with no player, and shows loading before the box scores arrive', () => {
    const { container, unmount } = wrap(<PlayerModal player={null} tz="UTC" onClose={() => {}} />)
    expect(container.querySelector('.modal')).toBeNull()
    unmount()
    resetBoxCache()
    wrap(<PlayerModal player={{ id: 'x', name: 'X' }} tz="UTC" onClose={() => {}} />)
    expect(screen.getByText(/Loading box scores/)).toBeInTheDocument()
  })
})

describe('StatsView', () => {
  it('switches category, notes 2025’s missing points, and waits for a season with no games', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<StatsView season={s2025} />)
    await user.click(await screen.findByRole('tab', { name: '3P%' }))
    expect(screen.getByText(/Leaders: Three-point %/)).toBeInTheDocument()
    expect(screen.getByText(/1.5 attempts per game/)).toBeInTheDocument()
    expect(screen.getByText(/leave 14 points this season/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '+/- per game' }))
    unmount()
    render(<StatsView season={{ year: 2028, games: [{ ...upcoming[0], score: undefined }], clubs: [] }} />)
    expect(screen.getByText(/No games played yet in 2028/)).toBeInTheDocument()
  })

  it('shows loading before the box scores arrive', () => {
    resetBoxCache()
    render(<StatsView season={s2026} />)
    expect(screen.getByText(/Loading box scores/)).toBeInTheDocument()
  })
})

describe('StandingsTable', () => {
  it('follows a club from the table, and says when nothing has been played', async () => {
    const user = userEvent.setup()
    wrap(<StandingsTable season={{ year: 2028, games: [], clubs: ['MIS', 'ROS'] }} />)
    expect(screen.getByText(/no games played yet/)).toBeInTheDocument()
    expect(screen.getByText(/league breaks this with a coin flip/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Follow Mist' }))
    expect(screen.getByRole('button', { name: 'Unfollow Mist' })).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

describe('Bracket', () => {
  it('waits for the season to start, and hides a finished season’s results when asked', () => {
    const { unmount } = render(<Bracket season={{ year: 2028, games: [], clubs: ['MIS'] }} tz="UTC" />)
    expect(screen.getByText(/appears once the 2028 season tips off/)).toBeInTheDocument()
    unmount()
    render(<Bracket season={s2026} tz="UTC" hideScores />)
    expect(document.querySelector('.banner-champ')).toBeNull()
    expect(document.querySelector('.bx-wins')).toBeNull()
    expect(screen.getAllByText('To be decided').length).toBeGreaterThan(0)
  })

  it('shows the time on an unplayed playoff game', () => {
    const p = s2026.games.filter((g) => g.seasonType === 'playoffs').map((g) => (g.round === 'Final' ? { ...g, score: undefined } : g))
    render(<Bracket season={{ ...s2026, games: [...s2026.games.filter((g) => g.seasonType === 'regular'), ...p] }} tz="UTC" />)
    expect(screen.getByText(/· \d+:\d\d [AP]M/)).toBeInTheDocument()
  })
})

describe('HistoryView', () => {
  it('opens a club from the archived club scoring at that year, and falls back to the newest season', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<HistoryView season={1999} onSeason={() => {}} tz="UTC" onPick={onPick} />)
    expect(screen.getByText('2026 season')).toBeInTheDocument()
    const scoring = (await screen.findByText('Club scoring')).closest('.card')
    await user.click(within(scoring).getAllByRole('button')[0])
    expect(onPick).toHaveBeenCalledWith(expect.any(String), 2026)
  })
})

describe('CalendarModal', () => {
  it('offers a club feed, copies a URL, and downloads three files', async () => {
    const user = userEvent.setup()
    localStorage.setItem('unr:followed', JSON.stringify(['MIS']))
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const onClose = vi.fn()
    wrap(<CalendarModal games={GAMES} filtered={GAMES.slice(0, 3)} onClose={onClose} />)
    expect(screen.getByText('My clubs (1)')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Copy URL' })[1])
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('?teams=MIS'))
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /All games/ }))
    await user.click(screen.getByRole('button', { name: /Current filter \(3\)/ }))
    await user.click(screen.getByRole('button', { name: /My clubs \(\d+\)/ }))
    expect(click).toHaveBeenCalledTimes(3)
    fireEvent.mouseDown(document.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
    click.mockRestore()
  })

  it('shrugs off a clipboard that refuses', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) }, configurable: true })
    wrap(<CalendarModal games={GAMES} filtered={GAMES} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Copy URL' }))
    expect(screen.getByRole('button', { name: 'Copy URL' })).toBeInTheDocument()
  })
})

describe('ServicesModal and the contexts', () => {
  it('picks and clears services, and closes from the backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    wrap(<ServicesModal onClose={onClose} />)
    await user.click(screen.getByLabelText(/HBO Max/))
    expect(JSON.parse(localStorage.getItem('unr:services'))).toEqual(['hbomax'])
    await user.click(screen.getByLabelText(/HBO Max/))
    await user.click(screen.getByLabelText(/Sling TV/))
    await user.click(screen.getByRole('button', { name: /Clear/ }))
    expect(JSON.parse(localStorage.getItem('unr:services'))).toEqual([])
    fireEvent.mouseDown(document.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
  })

  it('drops unknown or malformed saved values, and ignores an unknown key', async () => {
    const user = userEvent.setup()
    localStorage.setItem('unr:services', JSON.stringify(['hbomax', 'nbatv']))
    localStorage.setItem('unr:followed', '{not json')
    let api
    const Probe = () => {
      api = { follow: useFollow(), services: useServices() }
      return null
    }
    wrap(<Probe />)
    expect(api.services.services).toEqual(['hbomax'])
    expect(api.services.has('hbomax')).toBe(true)
    expect(api.follow.count).toBe(0)
    act(() => api.services.toggle('nbatv'))
    expect(api.services.count).toBe(1)
    act(() => api.follow.toggle('MIS'))
    act(() => api.follow.clear())
    expect(api.follow.count).toBe(0)
    localStorage.setItem('unr:services', '"a string"')
    wrap(<Probe />)
    expect(api.services.services).toEqual([])
    localStorage.setItem('unr:services', '{bad')
    wrap(<Probe />)
    expect(api.services.services).toEqual([])
    await user.click(document.body)
  })

  it('falls back to inert values with no provider', () => {
    let api
    const Probe = () => {
      api = { follow: useFollow(), services: useServices() }
      return null
    }
    render(<Probe />)
    api.follow.toggle('MIS')
    api.follow.clear()
    api.services.toggle('hbomax')
    api.services.clear()
    expect(api.follow.isFollowed('MIS')).toBe(false)
    expect(api.services.has('hbomax')).toBe(false)
  })
})

describe('small pieces', () => {
  it('draws nothing for an unknown club, and no stamp for no date', () => {
    const { container } = render(
      <>
        <TeamLogo abbr="XYZ" />
        <FooterTimes dataAt={null} tz="UTC" />
      </>
    )
    expect(container.innerHTML).toBe('')
  })

  it('loads the box scores once, and ignores a load that finishes after unmount', async () => {
    resetBoxCache()
    const Probe = () => {
      const box = useBox()
      return <span>{box ? 'ready' : 'waiting'}</span>
    }
    const { unmount } = render(<Probe />)
    unmount()
    await loadBox()
    render(<Probe />)
    expect(screen.getByText('ready')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument())
  })
})

describe('the last few paths', () => {
  it('marks a followed club in the bracket, and starts a season on a forfeit alone', () => {
    localStorage.setItem('unr:followed', JSON.stringify(['MIS']))
    const { unmount } = wrap(<Bracket season={s2026} tz="UTC" />)
    expect(document.querySelector('.bx-side.followed')).not.toBeNull()
    unmount()
    const f = s2025.games.find((g) => g.forfeit)
    render(<Bracket season={{ year: 2025, games: [f], clubs: ['LAC', 'VIN'] }} tz="UTC" />)
    expect(screen.queryByText(/appears once/)).toBeNull()
  })

  it('finds a playoff game listed with the lower seed at home', () => {
    const swapped = s2026.games.map((g) => (g.round === 'Final' ? { ...g, home: g.away, away: g.home, score: [...g.score].reverse() } : g))
    render(<Bracket season={{ ...s2026, games: swapped }} tz="UTC" />)
    expect(screen.getByText(/Mist/, { selector: '.banner-champ strong' })).toBeInTheDocument()
  })

  it('resets the copied label after a moment', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true })
    wrap(<CalendarModal games={GAMES} filtered={GAMES} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Copy URL' }))
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy URL' })).toBeInTheDocument(), { timeout: 3000 })
  })

  it('prints a dash for a percentage with no attempts, and closes from the backdrop', async () => {
    const onClose = vi.fn()
    wrap(<PlayerModal player={{ id: 'alyssa-thomas-0ehynljdh7k1', name: 'Alyssa Thomas' }} tz="UTC" onClose={onClose} />)
    expect((await screen.findAllByText('—')).length).toBeGreaterThan(0)
    fireEvent.mouseDown(document.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
  })

  it('opens a collapsed month from its heading', async () => {
    const user = userEvent.setup()
    render(<ScheduleView games={GAMES} tz="UTC" showPast />)
    const jan = screen.getByRole('button', { name: /January 2027/ })
    expect(jan).toHaveAttribute('aria-expanded', 'false')
    await user.click(jan)
    expect(jan).toHaveAttribute('aria-expanded', 'true')
  })

  it('unfollows a followed club', () => {
    let api
    const Probe = () => {
      api = useFollow()
      return null
    }
    wrap(<Probe />)
    act(() => api.toggle('MIS'))
    act(() => api.toggle('MIS'))
    expect(api.count).toBe(0)
  })
})
