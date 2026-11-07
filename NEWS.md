# NEWS

A dated changelog for The Unrivaled Schedule. Each heading is a calendar day; bullet
points capture every change made that day (features, fixes, data and source updates,
deployment). Newest day on top.

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
