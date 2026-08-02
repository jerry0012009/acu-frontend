import type { ACUExecutionPresetSeries } from '../types'

export function executionPresetPointAtDifficulty(
  series: ACUExecutionPresetSeries,
  difficulty: number
) {
  return (
    series.points.reduce<(typeof series.points)[number] | null>(
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

export function executionPresetLabels(series: ACUExecutionPresetSeries) {
  return [
    'Preset',
    `${series.reasoningEffort.charAt(0).toUpperCase()}${series.reasoningEffort.slice(1)} reasoning`,
    series.calibrationStatus.charAt(0).toUpperCase() +
      series.calibrationStatus.slice(1),
  ]
}
