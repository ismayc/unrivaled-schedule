// The app once the league has posted playoff games: the frozen board plus the 2026
// playoff games moved to 2027 and left unplayed. The phase chips only appear when a
// second phase exists, so this is the board that exercises them.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/data/schedule.js', async (importOriginal) => {
  const real = await importOriginal()
  const { HISTORY } = await import('../src/data/history.js')
  const playoffs = HISTORY.find((s) => s.year === 2026)
    .games.filter((g) => g.seasonType === 'playoffs')
    .map(({ score, line, stars, ...g }) => ({
      ...g,
      id: `f-${g.id}`,
      tip: new Date(Date.parse(g.tip) + 364 * 86400e3).toISOString(),
    }))
  return { ...real, GAMES: [...real.GAMES, ...playoffs] }
})

const { default: App } = await import('../src/App.jsx')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2027-02-09T20:00:00Z'))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('the schedule with playoff games posted', () => {
  it('offers a Playoffs chip that narrows the schedule to them', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/?past=1')
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    // The view tab has the same name; the chip is the one in the filter panel.
    await user.click(screen.getAllByRole('button', { name: '🏆 Playoffs' }).find((b) => b.classList.contains('phase-chip')))
    const cards = [...document.querySelectorAll('article.game')]
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.length).toBeLessThanOrEqual(5)
  })
})
