import { TEAM_BY_ABBR } from '../data/teams.js'

// Crests are mirrored into public/logos/ by scripts/fetch-schedule.mjs, so this makes no
// external requests. Each crest is a full roundel with its own ground, so one image
// reads on both themes (the ESPN siblings need a light and a dark variant).
export default function TeamLogo({ abbr, size = 28, className = '' }) {
  const team = TEAM_BY_ABBR[abbr]
  if (!team) return null
  return (
    <span className={`logo ${className}`} style={{ '--logo-size': `${size}px` }}>
      <img src={`${import.meta.env.BASE_URL}logos/${team.slug}.png`} alt="" width={size} height={size} loading="lazy" />
    </span>
  )
}
