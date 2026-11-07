// Reads unrivaled.basketball pages as data. Node built-ins only.
//
// Unrivaled publishes no JSON feed and is not on ESPN (checked November 7, 2026: ESPN's
// core API lists 15 basketball leagues and none is Unrivaled). Its site is a Next.js app
// that renders on the server, and a request sent with the `RSC: 1` header returns the
// React Server Components payload instead of HTML: the same element tree the page is
// built from, as newline-separated `id:json` rows. This module turns those rows back into
// one plain tree, `{ type, props, kids }`, that the parsers in unrivaled.mjs walk.
//
// Two details make a naive walk read the page in the wrong order or miss half of it:
//
//   - Rows refer to other rows. A string "$5a", "$L5a" or "$@5a" in place of a child means
//     "the tree in row 5a". The box score streams in this way, so a table row can be split
//     across four payload rows. resolve() follows every such reference.
//   - Client components carry page content in props other than `children` (layout slots
//     such as `notFound` or `template`). resolve() walks any array-valued prop too.
//
// The site sends no CORS headers, so none of this can run in a browser: the app reads
// only what scripts/fetch-schedule.mjs committed.

export function parseRows(raw) {
  const rows = new Map()
  for (const line of raw.split('\n')) {
    const m = /^([0-9a-f]+):(.*)$/.exec(line)
    if (!m) continue
    try {
      rows.set(m[1], JSON.parse(m[2]))
    } catch {
      // Import rows (`I[...]`) and text rows (`T...`) are not JSON and hold no page data.
    }
  }
  return rows
}

const clean = (list) => list.flat(Infinity).filter((k) => k != null && k !== false)

export function resolve(rows, node, depth = 0) {
  if (depth > 500) throw new Error('RSC tree deeper than 500: a reference cycle?')
  if (typeof node === 'number') return String(node)
  if (typeof node === 'string') {
    const ref = /^\$[L@]?([0-9a-f]+)$/.exec(node)
    if (ref) return rows.has(ref[1]) ? resolve(rows, rows.get(ref[1]), depth + 1) : null
    return node.startsWith('$') ? null : node
  }
  if (Array.isArray(node)) {
    if (node[0] === '$' && node.length === 4 && typeof node[1] === 'string') {
      const { children, ...props } = node[3] || {}
      const slots = Object.values(props).filter(Array.isArray)
      const kids = clean([children, ...slots].map((x) => resolve(rows, x, depth + 1)))
      return { type: node[1], key: node[2], props, kids }
    }
    return clean(node.map((x) => resolve(rows, x, depth + 1)))
  }
  if (node && typeof node === 'object')
    return clean(
      Object.values(node)
        .filter((v) => v && typeof v === 'object')
        .map((x) => resolve(rows, x, depth + 1))
    )
  return null
}

export function treeFromRsc(raw) {
  const rows = parseRows(raw)
  if (!rows.has('0')) throw new Error('RSC payload has no root row: the site changed its format')
  return { type: 'root', key: null, props: {}, kids: clean([resolve(rows, rows.get('0'))]) }
}

export function* walk(node) {
  if (!node || typeof node !== 'object') return
  yield node
  for (const k of node.kids) yield* walk(k)
}

// The visible text of a subtree, pieces joined with no separator, as a browser would.
export const textOf = (node) =>
  typeof node === 'string' ? node : node?.kids ? node.kids.map(textOf).join('') : ''

// The element children only (no bare text), which is how table rows are read.
export const elementKids = (node) => node.kids.filter((k) => typeof k === 'object')

export const hasClass = (node, prefix) =>
  typeof node.props?.className === 'string' &&
  node.props.className.split(/\s+/).some((c) => c.startsWith(prefix))
