// The single source of this league's identity, vocabulary, and display rules.
//
// Everything a component or util would otherwise hardcode inline lives here: the storage
// prefix, the period vocabulary, the .ics identity, the deploy host, the locale. The
// pattern comes from the-nfl-schedule; see that repo's src/config/league.js.
//
// Two rules this file is written to:
//
//   1. Every field below has a real consumer in src/. `title`, `tagline` and `themeColor`
//      are consumed by test/chrome-identity.test.js, because index.html and the manifest
//      are static files no module can import.
//   2. Structure stays out. The playoff format and the tiebreakers live in
//      src/utils/standings.js and src/utils/bracket.js. This file owns facts, not rules.
//
// Unlike its siblings this league has no ESPN path: Unrivaled is not on ESPN, and its own
// site sends no CORS headers, so there is no live overlay. Scores arrive with the
// refresh workflow, which reads the league's pages (scripts/fetch-schedule.mjs).
import { SEASON } from '../data/teams.js'

export const LEAGUE = {
  id: 'unrivaled',
  name: 'Unrivaled',
  // `title` + `tagline` are the two halves of index.html's <title>.
  title: 'The Unrivaled Schedule',
  tagline: 'every game in your timezone',
  season: SEASON,
  site: 'https://www.unrivaled.basketball',
  storageKey: 'unr', // 'unr:theme', 'unr:followed', …
  // UI chrome only. Matches --bg in index.css, <meta name="theme-color">, and the
  // manifest's theme_color and background_color.
  themeColor: '#14121a',

  // ── Vocabulary ──────────────────────────────────────────────────────────────
  periodNoun: 'quarter',
  periodShort: 'Q', // Q1…Q4
  // Three timed seven-minute quarters, then an untimed fourth played to a target score
  // (the Elam Ending), so a game can never go to overtime.
  regulationPeriods: 4,
  homeAwaySep: '@',
  // "Close finish": two scores in a league that plays to a target, where the last
  // basket decides it by at most three points plus whatever led into the fourth.
  closeMargin: 5,

  // ── Time ────────────────────────────────────────────────────────────────────
  locale: 'en-US',
  // A game runs about an hour on the floor; with broadcast breaks about 90 minutes.
  // A game with no score yet counts as possibly in progress for this long after tip.
  gameLengthMs: 1.5 * 60 * 60 * 1000,

  // ── Calendar export ─────────────────────────────────────────────────────────
  ics: {
    durationIso: 'PT1H30M',
    prodId: '-//the-unrivaled-schedule//EN',
    domain: 'the-unrivaled-schedule',
    filenameBase: 'unrivaled',
  },

  // Netlify serves /calendar.ics; GitHub Pages cannot run the function.
  feedHost: 'https://the-unrivaled-schedule.netlify.app',
}

export { SEASON }
