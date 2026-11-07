// The whole app on the frozen mid-season board (test/fixtures/frozen/schedule.js): the
// 2026 regular season moved to 2027, played through February 9.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'
import { HISTORY } from '../src/data/history.js'

const NOW = new Date('2027-02-09T20:00:00Z')

const mount = (search = '') => {
  window.history.replaceState(null, '', `/${search}`)
  return render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
  document.documentElement.dataset.theme = 'dark'
})
afterEach(() => vi.useRealTimers())

const tab = (name) => screen.getByRole('button', { name: new RegExp(name) })

describe('the app', () => {
  it('opens on the schedule with spoiler-free mode on, and the next game banner', () => {
    mount()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Unrivaled Schedule 2027')
    expect(screen.getByText(/Next game|Next games|Your next game/)).toBeInTheDocument()
    expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('.side-score')).toBeNull()
  })

  it('switches every view, and keeps the view in the URL', async () => {
    const user = userEvent.setup()
    mount('?hide=0')
    await user.click(tab('Standings'))
    expect(screen.getByRole('heading', { name: 'Standings' })).toBeInTheDocument()
    expect(window.location.search).toContain('view=standings')
    await user.click(tab('Playoffs'))
    expect(screen.getByText(/Projected\./)).toBeInTheDocument()
    await user.click(tab('Stats'))
    expect(await screen.findByText(/Leaders: Points/)).toBeInTheDocument()
    await user.click(tab('History'))
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByText(/Mist/, { selector: '.banner-champ strong' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '2025' }))
    expect(window.location.search).toContain('season=2025')
    expect(screen.getByText(/Rose/, { selector: '.banner-champ strong' })).toBeInTheDocument()
    await user.click(tab('Schedule'))
    expect(window.location.search).not.toContain('view=')
  })

  it('remembers spoiler-free and earlier-games choices, and toggles the theme', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByTitle('Spoiler-free mode'))
    expect(localStorage.getItem('unr:spoilerFree')).toBe('0')
    await user.click(screen.getByRole('button', { name: /Earlier games/ }))
    expect(localStorage.getItem('unr:showPast')).toBe('1')
    await user.click(screen.getByTitle('Toggle theme'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('unr:theme')).toBe('light')
    await user.click(screen.getByTitle('Toggle theme'))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('reads saved choices on load, and a link’s explicit choice over them', () => {
    localStorage.setItem('unr:spoilerFree', '0')
    localStorage.setItem('unr:showPast', '1')
    localStorage.setItem('unr:watchOnly', '1')
    const { unmount } = mount()
    expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'false')
    unmount()
    mount('?hide=1&past=0')
    expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'true')
  })

  it('survives storage that throws', async () => {
    const user = userEvent.setup()
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    mount()
    await user.click(screen.getByTitle('Spoiler-free mode'))
    await user.click(screen.getByTitle('Toggle theme'))
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    await user.click(screen.getByRole('button', { name: /Choose my services/ }))
    get.mockRestore()
    set.mockRestore()
  })

  it('filters by search, club, phase, and time, and clears them all', async () => {
    const user = userEvent.setup()
    mount('?hide=0')
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    const cards = () => [...document.querySelectorAll('article.game')]
    const before = cards().length
    const names = () => cards().map((c) => c.textContent)
    await user.click(screen.getByRole('button', { name: 'team: Mist' }))
    expect(names().every((t) => t.includes('Mist'))).toBe(true)
    expect(cards().length).toBeLessThan(before)
    await user.clear(screen.getByRole('searchbox'))
    await user.selectOptions(screen.getByLabelText('Club'), 'ROS')
    expect(names().every((t) => t.includes('Rose'))).toBe(true)
    await user.click(screen.getByRole('button', { name: /Clear$/ }))
    await user.click(screen.getByRole('button', { name: 'Regular season' }))
    await user.click(screen.getByRole('button', { name: 'Regular season' }))
    await user.click(screen.getByRole('button', { name: '✓ Finished' }))
    expect(cards().every((c) => c.classList.contains('state-final'))).toBe(true)
    await user.click(screen.getByRole('button', { name: '✓ Finished' }))
    await user.click(screen.getByRole('button', { name: '⏱ Upcoming' }))
    expect(cards().every((c) => c.classList.contains('state-upcoming'))).toBe(true)
    await user.click(screen.getByRole('button', { name: /Clear all/ }))
    expect(cards().length).toBe(before)
    expect(GAMES.length).toBe(56)
  })

  it('filters to followed clubs and to my services', async () => {
    const user = userEvent.setup()
    mount('?past=1')
    const card = document.querySelector('article.game')
    await user.click(within(card).getAllByRole('button', { name: /^Follow / })[0])
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    await user.click(screen.getByRole('button', { name: /My clubs \(1\)/ }))
    expect(window.location.search).toContain('mine=1')
    await user.click(screen.getByRole('button', { name: /Choose my services/ }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByLabelText(/YouTube TV/))
    await user.click(within(dialog).getByRole('button', { name: /Done/ }))
    await user.click(screen.getByRole('button', { name: /On my services/ }))
    // Every card left airs on TNT or truTV.
    for (const a of document.querySelectorAll('article.game')) expect(a.textContent).toMatch(/TNT|truTV/)
    await user.click(screen.getByRole('button', { name: /On my services/ }))
    await user.click(screen.getByRole('button', { name: 'Edit my services' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('changes the time zone, and keeps a zone other than this device’s in the URL', async () => {
    const user = userEvent.setup()
    mount()
    await user.selectOptions(screen.getByLabelText('Timezone'), 'America/Phoenix')
    expect(window.location.search).toContain('tz=America%2FPhoenix')
  })

  it('drops a game no chosen service carries', async () => {
    const user = userEvent.setup()
    // Late February: the board's three HBO Max-only games are inside the next fortnight.
    vi.setSystemTime(new Date('2027-02-25T00:00:00Z'))
    localStorage.setItem('unr:services', JSON.stringify(['youtubetv']))
    mount()
    const hboOnly = () =>
      [...document.querySelectorAll('article.game')].filter((a) => /HBO Max/.test(a.textContent) && !/TNT|truTV/.test(a.textContent)).length
    expect(hboOnly()).toBe(3)
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    await user.click(screen.getByRole('button', { name: /On my services/ }))
    expect(hboOnly()).toBe(0)
    expect(localStorage.getItem('unr:watchOnly')).toBe('1')
  })

  it('opens the calendar dialog and closes it', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: /Calendar/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a played game with its line score and box score, and a player from it', async () => {
    const user = userEvent.setup()
    mount('?past=1&hide=0')
    const played = GAMES.find((g) => g.score)
    await user.click(document.querySelector('article.game.state-final'))
    const dialog = screen.getByRole('dialog', { name: 'Game detail' })
    expect(within(dialog).getByText(/By quarter/)).toBeInTheDocument()
    expect(await within(dialog).findByText('Box score')).toBeInTheDocument()
    expect(played).toBeTruthy()
    const player = within(dialog).getAllByRole('button', { name: /\w+ \w+/ }).find((b) => b.classList.contains('lead-player'))
    await user.click(player)
    expect(screen.getByRole('dialog', { name: player.textContent })).toBeInTheDocument()
    expect(await screen.findByText(/game log/)).toBeInTheDocument()
    await user.click(document.querySelector('.pm-log .drill-row'))
    expect(screen.getByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
  })

  it('reveals one game’s score in spoiler-free mode, and sends a club to the schedule', async () => {
    const user = userEvent.setup()
    mount('?past=1')
    await user.click(document.querySelector('article.game.state-final'))
    const dialog = screen.getByRole('dialog', { name: 'Game detail' })
    expect(within(dialog).queryByText(/By quarter/)).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Reveal score' }))
    expect(within(dialog).getByText(/By quarter/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Hide score' }))
    await user.click(within(dialog).getAllByRole('button', { name: /schedule$/ })[0])
    expect(window.location.search).toMatch(/team=[A-Z]{3}/)
  })

  it('opens a club from the standings, then its game and player, and filters the schedule', async () => {
    const user = userEvent.setup()
    mount('?view=standings&hide=0')
    await user.click(document.querySelector('.standings .team-btn'))
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText(/2027 games/)).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: /Follow/ }))
    expect(within(panel).getByRole('button', { name: /Following/ })).toBeInTheDocument()
    // The roster loads with the box scores.
    await waitFor(() => expect(panel.querySelector('.tp-p-name')).not.toBeNull())
    const name = panel.querySelector('.tp-p-name').textContent
    await user.click(panel.querySelector('.tp-p-name'))
    expect(screen.getByRole('dialog', { name })).toBeInTheDocument()
  })

  it('opens a club panel’s game, and filters the schedule from the panel', async () => {
    const user = userEvent.setup()
    mount('?view=standings')
    await user.click(document.querySelector('.standings .team-btn'))
    await user.click(screen.getByRole('button', { name: /Filter the schedule to/ }))
    expect(window.location.search).toMatch(/team=/)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    await user.click(tab('Standings'))
    await user.click(document.querySelector('.standings .team-btn'))
    await user.click(document.querySelector('.modal .drill-row'))
    expect(screen.getByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens an archived club and game from History, at that season', async () => {
    const user = userEvent.setup()
    mount('?view=history&season=2025')
    const champs = screen.getByText('Champions').closest('.card')
    await user.click(within(champs).getAllByRole('button', { name: /Rose/ })[0])
    expect(within(screen.getByRole('dialog')).getByText(/2025: 8–6, seed 2/)).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText(/🏆 2025/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(within(champs).getByRole('button', { name: '62–54' }))
    const dialog = screen.getByRole('dialog', { name: 'Game detail' })
    expect(within(dialog).getByText(/Championship, 2025/)).toBeInTheDocument()
    // Archived seasons show their results whatever the spoiler setting.
    expect(within(dialog).getByText('54 – 62')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await user.click(within(champs).getByRole('button', { name: '2026' }))
    expect(window.location.search).toContain('season=2026')
    // A club from the archived standings and bracket opens at that year.
    await user.click(document.querySelectorAll('.standings .team-btn')[1])
    expect(within(screen.getByRole('dialog')).getByText(/2026:/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(document.querySelector('.bx-team'))
    expect(within(screen.getByRole('dialog')).getByText(/2026:/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(document.querySelector('.bx-open'))
    expect(screen.getByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
  })

  it('opens a game straight from a ?game= link, in any season', () => {
    const final = HISTORY[0].games.find((g) => g.round === 'Final')
    mount(`?game=${final.id}`)
    expect(screen.getByRole('dialog', { name: 'Game detail' })).toHaveTextContent('Championship, 2026')
  })

  it('ignores an unknown ?game= link', () => {
    mount('?game=nope')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the condensed view strip once the tab bar scrolls away', async () => {
    const user = userEvent.setup()
    let fire
    window.IntersectionObserver = class {
      constructor(cb) {
        fire = cb
      }
      observe() {}
      disconnect() {}
    }
    mount('?view=stats')
    act(() => fire([{ isIntersecting: false }]))
    const toggle = screen.getByRole('button', { name: /Stats/, expanded: false })
    await user.click(toggle)
    const strip = screen.getByRole('navigation', { name: 'Views quick switch' })
    await user.click(within(strip).getByRole('button', { name: /History/ }))
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument()
    act(() => fire([{ isIntersecting: true }]))
    expect(screen.queryByRole('navigation', { name: 'Views quick switch' })).toBeNull()
    delete window.IntersectionObserver
  })

  it('opens a player from the stats leaders, and a club from club scoring', async () => {
    const user = userEvent.setup()
    mount('?view=stats&hide=0')
    await user.click((await screen.findAllByRole('button', { name: /\w/ })).find((b) => b.classList.contains('lead-player')))
    expect(await screen.findByText(/By season/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(document.querySelector('.card .team-btn'))
    expect(within(screen.getByRole('dialog')).getByText(/2027 games/)).toBeInTheDocument()
  })

  it('counts games in progress in the tagline', () => {
    const live = GAMES.find((g) => !g.score && !g.timeTbd && !g.postponed)
    vi.setSystemTime(new Date(Date.parse(live.tip) + 10 * 60e3))
    mount()
    expect(screen.getByText(/in progress/, { selector: '.live-now' })).toBeInTheDocument()
  })
})

describe('the playoffs view in spoiler-free mode', () => {
  it('waits for the season before projecting anything', async () => {
    vi.setSystemTime(new Date('2026-12-01T00:00:00Z'))
    mount('?view=playoffs')
    expect(screen.getByText(/Projected\./)).toBeInTheDocument()
    await waitFor(() => expect(document.querySelectorAll('.bx-series').length).toBeGreaterThan(0))
  })
})
