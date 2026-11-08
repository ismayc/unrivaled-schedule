// Reads one unrivaled.basketball page as an RSC tree. Node built-ins only. Shared by the
// refresh (scripts/fetch-schedule.mjs) and the new-season watch
// (scripts/check-new-season.mjs), so both send the same headers at the same pace.
//
// Polite on purpose: one request at a time, a pause before each one, and retries only
// for a 5xx, a 429, or a network error. Any other status (a 403 or a 404) fails at once.

import { sleep, backoffMs } from './fetch.mjs'
import { treeFromRsc } from './rsc.mjs'
import { SITE } from './unrivaled.mjs'

export const PAUSE_MS = 400
export const HEADERS = {
  RSC: '1',
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
}

let requests = 0
export const requestCount = () => requests
export const countRequest = () => requests++

export async function getPage(path, tries = 4) {
  let last
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt) await sleep(backoffMs(attempt - 1))
    await sleep(PAUSE_MS)
    requests++
    try {
      const res = await fetch(SITE + path, { headers: HEADERS })
      if (res.ok) return treeFromRsc(await res.text())
      last = new Error(`HTTP ${res.status}`)
      if (res.status < 500 && res.status !== 429) break
    } catch (err) {
      last = err
    }
  }
  throw new Error(`${SITE}${path}\n  ${last.message}`)
}
