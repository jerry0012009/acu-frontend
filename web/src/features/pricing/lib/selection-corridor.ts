import type { ACUSelectionCorridorPoint, ACUSelectionCorridor } from '../types'

export type CorridorPreference = 'economy' | 'balanced' | 'quality'

export type CorridorTooltipDatum = {
  modelName?: string
  quality?: number
  cost?: number
}

export type CorridorDisplayValue = Pick<
  ACUSelectionCorridorPoint,
  'difficulty' | 'selectedQuality' | 'qualityLower' | 'qualityUpper'
>

// Pricing display only; never used for real routing, Tooltip values, or summaries.
export const CORRIDOR_DISPLAY_SMOOTH_RADIUS = 5
export const CORRIDOR_DISPLAY_SMOOTH_SIGMA = 2.5

export const PRICING_PREVIEW_CONTROL_GRID_CLASS =
  'grid shrink-0 grid-cols-1 items-end gap-2 sm:w-auto sm:grid-cols-2 xl:grid-cols-[minmax(240px,280px)_112px_112px]'

function clampQuality(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function gaussianSmooth(values: number[]): number[] {
  const weights = Array.from(
    { length: CORRIDOR_DISPLAY_SMOOTH_RADIUS * 2 + 1 },
    (_, index) => {
      const offset = index - CORRIDOR_DISPLAY_SMOOTH_RADIUS
      return Math.exp(
        -(offset * offset) /
          (2 * CORRIDOR_DISPLAY_SMOOTH_SIGMA * CORRIDOR_DISPLAY_SMOOTH_SIGMA)
      )
    }
  )

  return values.map((_, index) => {
    const start = Math.max(0, index - CORRIDOR_DISPLAY_SMOOTH_RADIUS)
    const end = Math.min(
      values.length - 1,
      index + CORRIDOR_DISPLAY_SMOOTH_RADIUS
    )
    let weightedSum = 0
    let weightTotal = 0

    for (let neighbor = start; neighbor <= end; neighbor += 1) {
      const weight = weights[neighbor - index + CORRIDOR_DISPLAY_SMOOTH_RADIUS]
      weightedSum += values[neighbor] * weight
      weightTotal += weight
    }

    return weightedSum / weightTotal
  })
}

export function buildSmoothedCorridorDisplayValues(
  values: ACUSelectionCorridorPoint[]
): CorridorDisplayValue[] {
  if (values.length === 0) return []

  const sortedValues = [...values].sort(
    (left, right) => left.difficulty - right.difficulty
  )
  const centers = sortedValues.map((point) => point.selectedQuality)
  const lowerWidths = sortedValues.map((point) =>
    Math.max(0, point.selectedQuality - point.qualityLower)
  )
  const upperWidths = sortedValues.map((point) =>
    Math.max(0, point.qualityUpper - point.selectedQuality)
  )
  const smoothedCenters = gaussianSmooth(centers)
  const smoothedLowerWidths = gaussianSmooth(lowerWidths)
  const smoothedUpperWidths = gaussianSmooth(upperWidths)

  return sortedValues.map((point, index) => {
    const selectedQuality = clampQuality(smoothedCenters[index])
    const qualityLower = clampQuality(
      selectedQuality - smoothedLowerWidths[index]
    )
    const qualityUpper = clampQuality(
      selectedQuality + smoothedUpperWidths[index]
    )

    return {
      difficulty: point.difficulty,
      selectedQuality,
      qualityLower: Math.min(qualityLower, selectedQuality),
      qualityUpper: Math.max(qualityUpper, selectedQuality),
    }
  })
}

export function resolveEffectiveCorridorPreference(
  previewTokenId: number | undefined,
  corridor: ACUSelectionCorridor | null | undefined,
  manualPreference: CorridorPreference
): CorridorPreference {
  return previewTokenId != null && corridor
    ? corridor.defaultPreference
    : manualPreference
}

export function isCorridorModelTooltipDatum(
  datum: CorridorTooltipDatum | null | undefined
): datum is Required<CorridorTooltipDatum> {
  return (
    typeof datum?.modelName === 'string' &&
    Number.isFinite(datum.quality) &&
    Number.isFinite(datum.cost)
  )
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
    if (preset.modelId && preset.points.length > 0) modelIds.add(preset.modelId)
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
