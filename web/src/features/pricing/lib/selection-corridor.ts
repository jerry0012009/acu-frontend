import type { ACUSelectionCorridorPoint, ACUSelectionCorridor } from '../types'

export type CorridorPreference = 'economy' | 'balanced' | 'quality'

export type CorridorInterval = {
  modelId: string
  startDifficulty: number
  endDifficulty: number
}

export function corridorIntervals(
  points: ACUSelectionCorridorPoint[]
): CorridorInterval[] {
  if (points.length === 0) return []
  const ordered = [...points].sort(
    (left, right) => left.difficulty - right.difficulty
  )
  const result: CorridorInterval[] = []
  for (const point of ordered) {
    const previous = result.at(-1)
    if (previous?.modelId === point.selectedModelId) {
      previous.endDifficulty = point.difficulty
    } else {
      result.push({
        modelId: point.selectedModelId,
        startDifficulty: point.difficulty,
        endDifficulty: point.difficulty,
      })
    }
  }
  return result
}

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
