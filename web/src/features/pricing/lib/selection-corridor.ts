import type { ACUSelectionCorridorPoint, ACUSelectionCorridor } from '../types'

export type CorridorPreference = 'economy' | 'balanced' | 'quality'

export const PRICING_PREVIEW_CONTROL_GRID_CLASS =
  'grid shrink-0 grid-cols-1 items-end gap-2 sm:w-auto sm:grid-cols-2 xl:grid-cols-[minmax(240px,280px)_112px_112px]'

export function resolveEffectiveCorridorPreference(
  previewTokenId: number | undefined,
  corridor: ACUSelectionCorridor | null | undefined,
  manualPreference: CorridorPreference
): CorridorPreference {
  return previewTokenId != null && corridor
    ? corridor.defaultPreference
    : manualPreference
}

export function corridorEligibleModelIds(
  corridor: ACUSelectionCorridor | null | undefined
): Set<string> {
  const modelIds = new Set<string>()
  if (!corridor) return modelIds
  for (const points of Object.values(corridor.series)) {
    for (const point of points) {
      if (point.selectedModelId) modelIds.add(point.selectedModelId)
      for (const candidate of point.candidates) {
        if (candidate.modelId) modelIds.add(candidate.modelId)
      }
    }
  }
  for (const point of corridor.effective ?? []) {
    if (point.selectedModelId) modelIds.add(point.selectedModelId)
    for (const candidate of point.candidates) {
      if (candidate.modelId) modelIds.add(candidate.modelId)
    }
  }
  for (const preset of corridor.executionPresetSeries) {
    if (preset.modelId) modelIds.add(preset.modelId)
  }
  return modelIds
}

export function corridorEffectivePointAtDifficulty(
  corridor: ACUSelectionCorridor | null | undefined,
  difficulty: number
): ACUSelectionCorridorPoint | null {
  return (
    (corridor?.effective ?? []).reduce<ACUSelectionCorridorPoint | null>(
      (nearest, point) => {
        if (!nearest) return point
        return Math.abs(point.difficulty - difficulty) <
          Math.abs(nearest.difficulty - difficulty)
          ? point
          : nearest
      },
      null
    ) ?? null
  )
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
