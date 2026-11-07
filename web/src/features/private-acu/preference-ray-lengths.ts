// Show within-profile strength differences, not an absolute 0-100 radial scale.
// A minimum score span prevents tiny differences from filling the entire chart.
export function preferenceRayLengths(scores: number[]): number[] {
  if (!scores.length) return []
  const minimum = Math.min(...scores)
  const maximum = Math.max(...scores)
  const span = Math.max(20, maximum - minimum)
  const midpoint = (minimum + maximum) / 2
  const lower = Math.max(0, Math.min(100 - span, midpoint - span / 2))
  return scores.map((score) => 64 + ((score - lower) / span) * 186)
}
