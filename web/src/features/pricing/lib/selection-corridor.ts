import type { ACUSelectionCorridorPoint, ACUSelectionCorridor } from '../types'

export type CorridorPreference = 'economy' | 'balanced' | 'quality'

export function corridorPointAtDifficulty(
  corridor: ACUSelectionCorridor | null | undefined,
  preference: CorridorPreference,
  difficulty: number
): ACUSelectionCorridorPoint | null {
  const points = corridor?.series[preference] ?? []
  return (
    points.reduce<ACUSelectionCorridorPoint | null>((nearest, point) => {
      if (!nearest) return point
      return Math.abs(point.difficulty - difficulty) <
        Math.abs(nearest.difficulty - difficulty)
        ? point
        : nearest
    }, null) ?? null
  )
}
