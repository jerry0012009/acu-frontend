import type {
  ACUExecutionPresetSeries,
  PricingDisplayMode,
  PricingModel,
} from '../types'
import { contextPricingRates, estimatedPricingCost } from './pricing-comparison'

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

export function executionPresetPricingCosts(
  series: ACUExecutionPresetSeries,
  baseModel: PricingModel | undefined,
  _mode: PricingDisplayMode,
  inputTokens: number,
  difficulty: number
) {
  const point = executionPresetPointAtDifficulty(series, difficulty)
  const payableCost = point?.estimatedCallCost
  const reference = contextPricingRates(baseModel?.reference, inputTokens)
  const referenceCost = estimatedPricingCost(
    reference?.input_cny_per_million,
    reference?.output_cny_per_million,
    inputTokens,
    series.estimatedOutputTokens
  )
  return {
    point,
    payableCost,
    referenceCost,
    displayCost: payableCost ?? Number.POSITIVE_INFINITY,
  }
}
