# The Unrivaled Schedule

[![CI](https://github.com/ismayc/unrivaled-schedule/actions/workflows/ci.yml/badge.svg)](https://github.com/ismayc/unrivaled-schedule/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/endpoint?url=https://ismayc.github.io/unrivaled-schedule/coverage.json)](https://github.com/ismayc/unrivaled-schedule/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

🔗 **Live:** [ismayc.github.io/unrivaled-schedule](https://ismayc.github.io/unrivaled-schedule/)

A React + Vite web app for [Unrivaled](https://www.unrivaled.basketball), the 3-on-3
women's basketball league: every game in **your** timezone, where to watch on your
services, the standings, the playoff bracket, box scores, leaders, and every past
season since the league's first in 2025.

No backend, no API keys, no tracking. The whole app is a static bundle plus a committed
snapshot of every season.

---

## Views

| View | What it shows |
|---|---|
| **Schedule** | Every game grouped by day in your timezone, with the next game counting down on top. The last week of results and the next two weeks of game-days by default; "Earlier games" opens the whole season by month. Filters: search (`team:`, `city:`, `venue:`, `tv:`), club, my followed clubs, my services, phase, and in progress / upcoming / finished. A game with no tip time yet says "Time TBD", and one with no channel yet says "Channel TBA". |
| **Standings** | The regular-season table with the playoff line, clinched and eliminated marks, points for and against, the last five, the streak, and net points per game. A star marks a club placed by a tiebreaker; hover it to see which one. |
| **Playoffs** | The bracket, one game per round. Before the playoffs it is projected from the current table. |
| **Stats** | Regular-season leaders in eight categories and club scoring, all added up from the box scores. |
| **History** | Each completed season (2025, 2026) through the same table, bracket, and leaders, plus a champions table. |

A game opens a detail with the score by quarter, the full box score, the venue and
channels, and the season's meetings between the two clubs. A club opens a panel with its
record, players, and every game. A player opens a line for every season they played and
that season's game log. Spoiler-free mode (on by default) hides the current season's
scores, records, brackets, and player numbers until you reveal them; the archive always
shows its results. The 📅 Calendar button subscribes to a `webcal://` feed or downloads
an `.ics` file.

## Data

Unrivaled is not on ESPN, which every other viewer in this family reads (ESPN's core API
lists 15 basketball leagues on November 7, 2026, and none is Unrivaled). The league
publishes no feed either, and its site sends no CORS headers, so a browser cannot read
it. So this app has **no live overlay**: `scripts/fetch-schedule.mjs` reads the league's
own pages, and the refresh workflow commits what it finds.

The site is a Next.js app. A request with the `RSC: 1` header returns the React Server
Components payload, the element tree the page is built from, and
`scripts/lib/rsc.mjs` turns it back into one tree. `scripts/lib/unrivaled.mjs` reads
three pages from it:

| Page | Gives |
|---|---|
| `/schedule?season=YYYY` | every game of a season: id, clubs, and the final score or tip label |
| `/game/{id}` | date and tip, venue, channels, score by quarter, and the round ("Game 2", "Semifinals", "Championship") |
| `/game/{id}/box-score` | one table of player lines per club |

The fetch is polite on purpose: one request at a time with a pause between them, and a
finished game is never fetched again once its box score is committed. It refuses to write
anything it cannot check: a game page and the schedule must agree on clubs and score,
each club's TEAM row must equal its score, every club must have played the same number
of regular-season games, and each archived season must crown its known champion.

### Things worth knowing about the source

- **Away comes first, everywhere.** The schedule's "Mist vs Phantom" marks Phantom as
  home, and the game page labels Mist's crest "Away Team Logo".
- **Tip times print in the visitor's time zone**, with the venue's own clock in
  parentheses when the two differ. From Arizona the Intuit Dome opener reads "9:30 PM MST
  (8:30 PM PT)"; GitHub's CI gets "10:30 PM CT (8:30 PM PT)", and "8:00 PM CT" for a
  Central venue. The parser reads the first clock in its own zone, checks it against the
  venue clock, and fails if they disagree, or if a time label is neither a readable time
  nor the league's "to be set" or "TBD". The refresh compares schedule labels as UTC
  times, so a run from another zone does not refetch every game.
- **Free throws can be worth one, two, or three points.** Points come from each line's
  PTS column, never from makes. In the 2026 final, Breanna Stewart had 25 points from
  eight twos and three threes, and 7 from four free throws.
- **The fourth quarter is untimed**, played to a target score, so a game never goes to
  overtime.
- **A few league box scores leave out a player who scored.** On `/game/73tp1uzii8x2`
  (2025) four Laces players total 46 while the TEAM row says 60. The gap is recorded in
  the data and named in the box score and leaders, never invented.
- **The 2025 schedule leaves out one game.** Laces vs. Vinyl on February 8, 2025 was
  canceled for player health and safety and ruled a Laces forfeit, a Vinyl win (league
  president Alex Bazzell to CBS Sports). The fetch script declares it, so both clubs
  have their 14 results; it counts in W and L but adds no points.

### Verified against outside sources (November 7, 2026)

- The 2026 table derived from the games matches the league's own standings page in all
  eight rows: wins, losses, points for, points against, and order.
- The 2025 table matches the published seeds (Lunar Owls, Rose, Laces, Vinyl, Mist,
  Phantom), which the semifinal pairings confirm.
- The tiebreak chain (head-to-head, then record against playoff clubs, then point
  differential) reproduces both orders. Rose finished 4th over Breeze in 2026 on record
  against playoff clubs, though Breeze had the better differential.
- Both brackets rebuild from the games: Rose won 2025 over Vinyl, 62 to 54, and Mist won
  2026 over Phantom, 80 to 74.
- The leaders match the league's stats page for both seasons (Napheesa Collier 25.7 and
  Marina Mabrey 25.3 points per game, Chelsea Gray first in assists both years).

### Format notes

- **2025:** six clubs, 14 games each. The top four went straight to single-game
  semifinals (1 v 4, 2 v 3), then a championship game.
- **2026 on:** eight clubs, 14 games each, every club meeting every other twice. Six
  qualify: seeds 3 to 6 play a first round, and the semifinals reseed, so the 1 seed
  meets the lowest seed left. 2027 inherits the 2026 format until the league says
  otherwise.
- **2027** tours: the season opens January 8, 2027 at TD Garden in Boston and visits
  other arenas before returning to Sephora Arena in Miami.

## Develop

```bash
npm install
npm run dev              # local dev server
npm test                 # unit + render tests, against frozen data
npm run test:data        # the live suite: the real committed data (what a refresh must pass)
npm run build            # production bundle
npm run coverage:badge   # tests with coverage, writes public/coverage.json

npm run fetch:schedule   # refresh the schedules and the games within half a day of now
npm run fetch:full       # refetch every unplayed game (tip times and channels set weeks ahead)
npm run check:new-season # has the league posted next season's schedule? (two requests)
node test/fixtures/make-frozen.mjs   # rebuild the frozen test data from the committed data
```

`scripts/` uses **Node built-ins only**, so CI runs the data jobs on a bare checkout with
no install step. A CI job and `test/guards.test.js` both enforce this.

### Testing approach

There are two suites, and they never mix:

- **The main suite** (`npm test`, the 100% coverage gate) never sees the modules the
  refresh rewrites. A plugin in `vite.config.js` resolves every import of the five
  `src/data/` modules to frozen stand-ins under `test/fixtures/frozen/`: a mid-season
  board built from the 2026 regular season moved 52 weeks forward, played through
  February 9, 2027, plus a copy of the archive and the box scores. Coverage therefore
  cannot move when the data does.
- **The live suite** (`npm run test:data`, `test/live/`) reads the real modules with no
  coverage threshold: every played game's line score, box score, and score agree, every
  club plays the same number of games, every archived bracket rebuilds its champion,
  and every view renders. This is the gate a refresh has to pass.

`test/derive.test.js` holds the verified facts above, and `test/scraper.test.js` runs
the parsers offline against six league pages saved as gzipped fixtures in
`test/fixtures/rsc/`.

## Deploy

Built with `base: './'`, so the same `dist/` works at a domain root and under a subpath
(GitHub Pages `/unrivaled-schedule/`) with no separate build.

- **GitHub Pages** deploys from `ci.yml` on every push to `main`, gated on tests passing,
  and from `refresh-data.yml` whenever a refresh commits new data.
- **The refresh** (`refresh-data.yml`) runs every 30 minutes from 00:00 to 06:30 UTC,
  January through March (5:00 to 11:30 PM Arizona time, which covers every tip so far),
  and once a day all year with `--full`. It commits straight to `main`.
- **The new-season watch** (`new-season-watch.yml`) runs daily. Nothing rolls over on its
  own: the refresh follows the season committed in `src/data/teams.js`. The watch reads the
  season picker on the league's schedule page, and the day it lists the next season, the
  watch files one issue. Once that schedule is complete and the committed season's
  Championship is final, it also drafts the rollover PR (`--season NEXT --full` on a
  `season-NEXT` branch; never delete that branch, it is the once-per-season guard). The
  picker is the signal because `/schedule?season=` for a season the site lacks answers
  with the current season's games.
- **`hub-feed.json`** is written by the build (the `hubFeed` plugin in `vite.config.js`,
  from `src/utils/hubFeed.js`): the current season for the family hub, which reads ESPN for
  every other viewer and cannot read this league there. It shares the hub's origin, so it
  needs no CORS, and it redeploys with every refresh that changes the data.
- The `webcal://` calendar feed is a Netlify function (`netlify/functions/calendar.mjs`)
  and serves from `the-unrivaled-schedule.netlify.app` once that site is linked; GitHub
  Pages cannot run functions, so on Pages the calendar offers the `.ics` download.

### Icons

The mark is a center circle with three players a side, in the app's chartreuse on its
dark ground, with no league or club mark. Sources live in `design/`: `favicon.svg` (also
`public/favicon.svg` and `public/icon.svg`) and `og-source.html`. Re-render with:

```bash
python3 -I ~/.claude/skills/web-page-meta/render_meta.py --dir design --bg "#14121a"
cp design/og.png public/og-image.png && cp design/apple-touch-icon.png design/favicon-32.png public/
```

## Credits

Created by [Chester Ismay](https://chesterismay.com). Source on
[GitHub](https://github.com/ismayc/unrivaled-schedule).

Unofficial fan project. Not affiliated with, endorsed by, or sponsored by Unrivaled.
Club names and crests are trademarks of their respective owners. Schedule, results, and
box scores from [unrivaled.basketball](https://www.unrivaled.basketball).
