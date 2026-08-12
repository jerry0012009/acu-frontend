import type { PricingDisplayMode, PricingModel } from '../types'

export type PricingCostDatum = {
  modelId: string
  modelName: string
  payableCost?: number
  referenceCost?: number
  payableInput?: number
  payableOutput?: number
  referenceInput?: number
  referenceOutput?: number
  referenceSource?: string
  referenceObservedAt?: string
  status?: 'verified' | 'estimated'
  displayCost: number
  abilityScore: number
}

export function estimatedPricingCost(
  inputPrice: number | undefined,
  outputPrice: number | undefined,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  if (inputPrice === undefined || outputPrice === undefined) return undefined
  return (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000
}

export function displayedPricingCost(
  model: PricingModel,
  _mode: PricingDisplayMode,
  inputTokens: number,
  outputTokens: number,
  protocol: 'all' | 'responses' | 'messages' = 'all'
): number {
  const protocolPrice =
    protocol === 'all'
      ? model.payable
      : (model.payable_by_protocol?.[protocol] ?? model.payable)
  return (
    estimatedPricingCost(
      protocolPrice?.input_cny_per_million,
      protocolPrice?.output_cny_per_million,
      inputTokens,
      outputTokens
    ) ?? Number.POSITIVE_INFINITY
  )
}

export function compareDisplayedCostsDescending(
  left: number,
  right: number
): number {
  if (!Number.isFinite(right)) return Number.isFinite(left) ? -1 : 0
  if (!Number.isFinite(left)) return 1
  return right - left
}

export function pricingCostRange(costs: number[]) {
  const finite = costs
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
  return { minimum: finite[0] ?? 0, maximum: finite.at(-1) ?? 0 }
}

export function buildPricingBarSeries(mode: PricingDisplayMode) {
  const reference = {
    type: 'bar' as const,
    id: 'reference-price',
    dataIndex: 0,
    regionIndex: 0,
    direction: 'horizontal' as const,
    xField: 'referenceCost',
    yField: 'modelName',
    barMinHeight: 1,
    zIndex: 1,
    opacity: 0.12,
  }
  const payable = {
    type: 'bar' as const,
    id: 'payable-price',
    dataIndex: 0,
    regionIndex: 0,
    direction: 'horizontal' as const,
    xField: 'payableCost',
    yField: 'modelName',
    barMinHeight: 3,
    zIndex: 2,
    opacity: 1,
  }
  if (mode === 'payable_only' || mode === 'reference_only') return [payable]
  return [reference, payable]
}

type PricingCostSpecOptions = {
  axisColor: string
  gridColor: string
  axisTitle: string
  formatAxisLabel: (value: number | string) => string
  colorForDatum: (datum: { modelId?: string }) => string
  tooltip: Record<string, unknown>
}

export function buildPricingCostSpec(
  mode: PricingDisplayMode,
  costData: PricingCostDatum[],
  options: PricingCostSpecOptions
) {
  const series = buildPricingBarSeries(mode).map((item) => ({
    ...item,
    bar: {
      style: {
        cornerRadius: 3,
        fillOpacity: item.opacity,
        fill: options.colorForDatum,
      },
    },
  }))
  const seriesIndexes = series.map((_, index) => index)

  return {
    type: 'common' as const,
    direction: 'horizontal' as const,
    data: [{ id: 'acu-model-costs', values: costData }],
    region: [{ id: 'acu-cost-region' }],
    series,
    animation: false,
    legends: { visible: false },
    tooltip: options.tooltip,
    axes: [
      {
        orient: 'bottom' as const,
        type: 'linear' as const,
        min: 0,
        regionIndex: 0,
        seriesIndex: seriesIndexes,
        title: { visible: true, text: options.axisTitle },
        label: {
          formatMethod: options.formatAxisLabel,
          style: { fill: options.axisColor, fontSize: 11 },
        },
        grid: {
          visible: true,
          style: { stroke: options.gridColor, lineDash: [3, 3] },
        },
      },
      {
        orient: 'left' as const,
        type: 'band' as const,
        regionIndex: 0,
        seriesIndex: seriesIndexes,
        label: {
          style: { fill: options.axisColor, fontSize: 11 },
          autoLimit: true,
        },
      },
    ],
  }
}
