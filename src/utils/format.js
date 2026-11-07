// Small number formats shared by the tables.

// The CSS class for a signed figure: green above zero, red below, plain at zero.
export const netClass = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '')

// One decimal with an explicit plus sign above zero.
export const signed = (n) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1))

// The longest bar on a leaderboard: the largest absolute value, or 1 when every value is
// zero (early in a season a whole category can be), so no bar divides by zero.
export const barMax = (values) => Math.max(0, ...values.map(Math.abs)) || 1
