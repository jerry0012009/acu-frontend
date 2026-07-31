export const PRICE_COLOR_STOPS = [
  '#2563eb',
  '#0891b2',
  '#16a34a',
  '#ca8a04',
  '#ea580c',
  '#dc2626',
  '#a21caf',
]

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) => Math.round(value).toString(16).padStart(2, '0'))
    .join('')}`
}

export function priceRankColor(rank: number): string {
  const normalized = Math.max(0, Math.min(1, rank))
  const scaled = normalized * (PRICE_COLOR_STOPS.length - 1)
  const lowerIndex = Math.floor(scaled)
  const upperIndex = Math.min(PRICE_COLOR_STOPS.length - 1, lowerIndex + 1)
  const ratio = scaled - lowerIndex
  const lower = hexToRgb(PRICE_COLOR_STOPS[lowerIndex])
  const upper = hexToRgb(PRICE_COLOR_STOPS[upperIndex])
  return rgbToHex(
    lower[0] + (upper[0] - lower[0]) * ratio,
    lower[1] + (upper[1] - lower[1]) * ratio,
    lower[2] + (upper[2] - lower[2]) * ratio
  )
}

export function buildPriceRankColorMap(
  items: Array<{ id: string; cost: number }>
): Map<string, string> {
  const ranked = [...items].sort((left, right) => left.cost - right.cost)
  const uniqueCosts = [...new Set(ranked.map((item) => item.cost))]
  const rankByCost = new Map(
    uniqueCosts.map((cost, index) => [
      cost,
      uniqueCosts.length <= 1 ? 0.5 : index / (uniqueCosts.length - 1),
    ])
  )
  return new Map(
    ranked.map((item) => [
      item.id,
      priceRankColor(rankByCost.get(item.cost) ?? 0.5),
    ])
  )
}
