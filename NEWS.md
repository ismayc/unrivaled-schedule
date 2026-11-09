# NEWS

A dated changelog for The Unrivaled Schedule. Each heading is a calendar day; bullet
points capture every change made that day (features, fixes, data and source updates,
deployment). Newest day on top.

## 2026-11-08

- **The clock rehearsal in CI runs its seven dates in parallel.** It ran them one after
  another, which made that job take 3 minutes. Each date is now its own job, with the same
  dates, the same command, and the same coverage gate, as in the other live viewers.
- **Every 2027 tip time is back, and a refresh reads them from any time zone.** The league
  prints a tip in the visitor's zone, and GitHub's CI sees Central time, not Arizona's
  MST. The parser required MST, so this morning's CI refresh stored all 52 timed 2027
  games as "Time TBD", each with its clock in place of the venue. The parser now reads a
  clock in any US zone, stops on one it cannot read, and the live suite fails if a venue
  or city holds a clock. A refresh from a different zone also refetched every game,
  because the schedule's labels looked changed; they are now compared as UTC times.
- **A new-season watch.** A daily workflow reads the season picker on the league's
  schedule page. The day it lists 2028, the watch files an issue, and once the full
  schedule is posted and the 2027 Championship is final, it drafts the rollover PR. The
  picker is the signal, not the game count, because the league answers a request for a
  season it does not have with the current season's games. The page reader moved to
  `scripts/lib/page.mjs` so the refresh and the watch share it. The `check:schedule`
  npm script pointed at a file that never existed and is gone.
- **Eight West Coast games have their tip times.** The league prints a game's second
  clock in the venue's zone ("9:30 PM MST (8:30 PM PT)"), and only ET was read, so every
  game at the Intuit Dome, Chase Center, Target Center, and Toyota Arena showed "Time
  TBD". Each zone is now checked in its own clock, and a time label the parser cannot read
  stops the refresh instead of becoming "Time TBD". Four games are still TBD; the league
  says "tip time to be set" for them.
- **The family hub can show Unrivaled.** The build publishes `hub-feed.json`, the current
  season in a small shape the hub reads from the same origin, since the hub's usual source,
  ESPN, does not carry the league.
- **The freshness monitor heals before it alarms.** A stale verdict now runs Refresh once
  and waits up to 20 minutes for it to fetch. Its first run here had filed a false issue,
  because the day-old repo's daily Refresh had not fired yet.

## 2026-11-07

- **First release.** Every game of the 2027 season in your timezone, the standings, the
  playoff bracket, stats, and the 2025 and 2026 seasons in History, with box scores for
  all 105 games played so far.
- **Data from the league's own site.** Unrivaled is not on ESPN, so the app reads
  unrivaled.basketball's pages through their React Server Components payload, one request
  at a time, and commits the result. There is no live overlay; scores arrive with the
  refresh, every 30 minutes on game nights.
- **Checked against outside sources.** The 2026 table matches the league's standings page
  row for row, the 2025 seeds match the published ones, both champions rebuild from the
  games, and the leaders match the league's stats page.
- **The 2025 Laces forfeit is in the table.** The league's schedule leaves out the canceled
  February 8, 2025 game, ruled a Vinyl win. It counts in W and L but adds no points.
