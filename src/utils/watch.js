// The streaming services and TV packages a viewer can tell us they have, so the
// schedule can flag which games they can actually watch — and filter to them.
//
// A game's `broadcast` is the list of partners the league's game page links to under
// "Where to Watch" (scripts/lib/unrivaled.mjs maps each link to a name). Unrivaled's
// partners are TNT and truTV on linear TV, and HBO Max, which streams every game. A
// live-TV bundle carries a game whenever it airs on a network the bundle carries, so
// each bundle is defined by its networks. Carriage is the national default and
// deliberately approximate (Fubo carries neither Turner network). The WNBA sibling also
// offers each local channel its games name; every Unrivaled game airs only on the
// league's partners, so there are none to offer.

const TNT = 'TNT'
const TRUTV = 'truTV'
const HBOMAX = 'HBO Max'

// Matching is case-insensitive because feeds change the case of a network's name
// without notice (the NFL sibling's ESPN feed turned "FOX" into "Fox" on October 5,
// 2026, and exact matching then read every Fox game as on no service).
const nameKey = (n) => String(n).toLowerCase()
const nameSet = (names) => new Set(names.map(nameKey))

// carries(...names) → a matcher that's true when a game's broadcast list names any
// of them.
const carries = (...names) => {
  const set = nameSet(names)
  return (broadcast) => broadcast.some((n) => set.has(nameKey(n)))
}

// Ordered streaming-first, then live-TV bundles. This is also the display order for
// badges and the picker. `kind` only labels the picker ('Streaming' vs 'Live TV').
export const SERVICE_CATALOG = [
  { key: 'hbomax', label: 'HBO Max', kind: 'stream', match: carries(HBOMAX) },
  { key: 'youtubetv', label: 'YouTube TV', kind: 'bundle', match: carries(TNT, TRUTV) },
  { key: 'hulu', label: 'Hulu + Live TV', kind: 'bundle', match: carries(TNT, TRUTV) },
  { key: 'sling', label: 'Sling TV', kind: 'bundle', match: carries(TNT, TRUTV) },
  { key: 'directv', label: 'DIRECTV Stream', kind: 'bundle', match: carries(TNT, TRUTV) },
  { key: 'cable', label: 'Cable / Satellite', kind: 'bundle', match: carries(TNT, TRUTV) },
]

export const SERVICE_BY_KEY = Object.fromEntries(SERVICE_CATALOG.map((s) => [s.key, s]))

// Broadcast entries not already shown as a personalized 📺 badge, so a game on
// "Peacock" (with Peacock selected) renders one "📺 Peacock" badge rather than the
// redundant "Peacock · 📺 Peacock". Bundle badges (e.g. YouTube TV) don't match a
// broadcast name, so their underlying network (TNT, truTV) is left in place.
export function broadcastNotBadged(broadcast, watched) {
  if (!broadcast?.length) return []
  const shown = nameSet((watched || []).map((s) => s.label))
  return broadcast.filter((b) => !shown.has(nameKey(b)))
}

// The viewer's selected services (by key) that carry this game, in catalog order.
// Returns [] when nothing is selected or the broadcast is unknown — so a viewer who
// hasn't chosen services sees no personalized badge (the raw network list in the
// card meta still shows where the game is on).
export function watchableServices(broadcast, selectedKeys) {
  if (!broadcast?.length || !selectedKeys?.length) return []
  const selected = new Set(selectedKeys)
  return SERVICE_CATALOG.filter((s) => selected.has(s.key) && s.match(broadcast))
}
