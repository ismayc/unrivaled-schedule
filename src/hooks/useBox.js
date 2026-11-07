import { useEffect, useState } from 'react'

// The box scores (src/data/boxscores.js, ~270KB for every game of every season) load on
// first use rather than with the page: the schedule paints without them, and the game
// detail, leaders and player views wait for one import that every later use shares.
let cache = null

export const loadBox = () => import('../data/boxscores.js').then((m) => (cache = m.BOX))

export function useBox() {
  const [box, setBox] = useState(cache)
  useEffect(() => {
    if (cache) return
    let live = true
    loadBox().then((b) => live && setBox(b))
    return () => {
      live = false
    }
  }, [])
  return box
}

// Tests only: forget the loaded module so the loading state can be exercised again.
export const resetBoxCache = () => {
  cache = null
}
