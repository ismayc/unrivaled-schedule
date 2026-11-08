# NEWS

A dated changelog for The Unrivaled Schedule. Each heading is a calendar day; bullet
points capture every change made that day (features, fixes, data and source updates,
deployment). Newest day on top.

## 2026-11-08

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
