// FROZEN test stand-in written by test/fixtures/make-frozen.mjs; do not edit by hand.

export const SEASON = 2027

export const TEAMS = [
  {
    "abbr": "BRE",
    "slug": "breeze",
    "name": "Breeze",
    "displayName": "Breeze",
    "color": "#4a3a78",
    "altColor": "#c8327a",
    "seasons": [
      2026,
      2027
    ]
  },
  {
    "abbr": "HIV",
    "slug": "hive",
    "name": "Hive",
    "displayName": "Hive",
    "color": "#e0a91c",
    "altColor": "#3c4248",
    "seasons": [
      2026,
      2027
    ]
  },
  {
    "abbr": "LAC",
    "slug": "laces",
    "name": "Laces",
    "displayName": "Laces",
    "color": "#4f9a88",
    "altColor": "#d9898f",
    "seasons": [
      2025,
      2026,
      2027
    ]
  },
  {
    "abbr": "LUN",
    "slug": "lunar-owls",
    "name": "Lunar Owls",
    "displayName": "Lunar Owls",
    "color": "#3d2f86",
    "altColor": "#f2e07e",
    "seasons": [
      2025,
      2026,
      2027
    ]
  },
  {
    "abbr": "MIS",
    "slug": "mist",
    "name": "Mist",
    "displayName": "Mist",
    "color": "#0b2f5c",
    "altColor": "#a6d4e4",
    "seasons": [
      2025,
      2026,
      2027
    ]
  },
  {
    "abbr": "PHA",
    "slug": "phantom",
    "name": "Phantom",
    "displayName": "Phantom",
    "color": "#1b1b1b",
    "altColor": "#e6e6e6",
    "seasons": [
      2025,
      2026,
      2027
    ]
  },
  {
    "abbr": "ROS",
    "slug": "rose",
    "name": "Rose",
    "displayName": "Rose",
    "color": "#12504a",
    "altColor": "#d6a08f",
    "seasons": [
      2025,
      2026,
      2027
    ]
  },
  {
    "abbr": "VIN",
    "slug": "vinyl",
    "name": "Vinyl",
    "displayName": "Vinyl",
    "color": "#7f0f35",
    "altColor": "#6fc6d4",
    "seasons": [
      2025,
      2026,
      2027
    ]
  }
]

export const TEAM_BY_ABBR = Object.fromEntries(TEAMS.map((t) => [t.abbr, t]))

export const ALL_ABBRS = TEAMS.filter((t) => t.seasons.includes(SEASON)).map((t) => t.abbr)
