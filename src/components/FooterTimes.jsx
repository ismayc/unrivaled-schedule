import { formatStamp } from '../utils/time.js'

// "Data as of": when the committed snapshot (schedule, results, box scores) last
// changed. It comes from src/data/meta.js, which the refresh rewrites only when the data
// changes, so an old date here means the refresh pipeline has stalled. The WNBA sibling
// also shows when its live poll last ran; this league has no live feed to poll.
export default function FooterTimes({ dataAt, tz }) {
  const data = formatStamp(dataAt, tz)
  return data ? <span className="dim">Data as of {data}</span> : null
}
