import type {
  ACUSelectionCorridor,
  ContextTierPrices,
  PricingDisplayMode,
  PricingModel,
  PricingPayable,
  PricingProtocol,
} from '../types'

export function applyPricingPreview(
  models: PricingModel[],
  corridor: ACUSelectionCorridor | undefined,
  protocol: PricingProtocol,
  status: 'loading' | 'error' | 'ready'
): PricingModel[] {
  return models.map((model) => {
    if (
      model.price_currency !== 'CNY' ||
      !model.price_semantics?.startsWith('estimated_user_')
    ) {
      return model
    }
    const price =
      status === 'ready' ? corridor?.pricing?.[model.model_name] : undefined
    const routes = (price?.routes ?? []).map((route) => ({
      id: route.executionProfileId,
      display_name: route.displayName,
      selected: route.selected,
      payable: {
        input_cny_per_million: route.payable.inputCnyPerMillion,
        output_cny_per_million: route.payable.outputCnyPerMillion,
        cached_input_cny_per_million: route.payable.cachedInputCnyPerMillion,
        cache_write_cny_per_million: route.payable.cacheWriteCnyPerMillion,
        context_tiers: route.payable.contextTiers,
        status: route.payable.status,
        pricing_policy_version: route.payable.pricingPolicyVersion,
      },
    }))
    const selected = routes.find(
      (route) => route.selected && route.id === price?.executionProfileId
    )
    const selectedPayable = selected?.payable
    const payable =
      selectedPayable &&
      Number.isFinite(selectedPayable.input_cny_per_million) &&
      Number.isFinite(selectedPayable.output_cny_per_million) &&
      selectedPayable.input_cny_per_million >= 0 &&
      selectedPayable.output_cny_per_million >= 0
        ? selectedPayable
        : undefined
    return {
      ...model,
      payable,
      payable_by_protocol: payable ? { [protocol]: payable } : {},
      input_price_per_million: payable?.input_cny_per_million,
      output_price_per_million: payable?.output_cny_per_million,
      cached_input_price_per_million: payable?.cached_input_cny_per_million,
      model_ratio: (payable?.input_cny_per_million ?? 0) / 2,
      completion_ratio:
        payable && payable.input_cny_per_million > 0
          ? payable.output_cny_per_million / payable.input_cny_per_million
          : 0,
      cache_ratio:
        payable &&
        payable.cached_input_cny_per_million != null &&
        payable.input_cny_per_million > 0
          ? payable.cached_input_cny_per_million / payable.input_cny_per_million
          : undefined,
      create_cache_ratio:
        payable &&
        payable.cache_write_cny_per_million != null &&
        payable.input_cny_per_million > 0
          ? payable.cache_write_cny_per_million / payable.input_cny_per_million
          : undefined,
      acu_currently_eligible: payable != null,
      acu_quote: {
        status: status === 'ready' && price && !payable ? 'error' : status,
        protocol,
        supply_strategy: corridor?.supplyStrategy,
        generated_at: corridor?.generatedAt,
        routes,
      },
    }
  })
}

export function contextPricingRates<
  T extends {
    input_cny_per_million: number
    output_cny_per_million: number
    cached_input_cny_per_million?: number
    cache_write_cny_per_million?: number
    context_tiers?: ContextTierPrices
  },
>(price: T | undefined, inputTokens: number): T | undefined {
  if (!price?.context_tiers) return price
  const tiers = price.context_tiers
  const selected =
    inputTokens > tiers.thresholdTokens ? tiers.longContext : tiers.standard
  return {
    ...price,
    input_cny_per_million: selected.inputPricePerMillion,
    output_cny_per_million: selected.outputPricePerMillion,
    cached_input_cny_per_million: selected.cachedInputPricePerMillion,
    cache_write_cny_per_million: selected.cacheWritePricePerMillion,
  }
}

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

export function defaultACUPricingProtocol(
  payableByProtocol: PricingModel['payable_by_protocol']
):
  | 'responses'
  | 'messages'
  | 'chat_completions'
  | 'chat_completions'
  | undefined {
  if (payableByProtocol?.responses) return 'responses'
  if (payableByProtocol?.messages) return 'messages'
  if (payableByProtocol?.chat_completions) return 'chat_completions'
  return undefined
}

export function selectedACUPricingPayable(
  model: Pick<PricingModel, 'payable' | 'payable_by_protocol'>
): PricingPayable | undefined {
  const protocol = defaultACUPricingProtocol(model.payable_by_protocol)
  return protocol
    ? (model.payable_by_protocol?.[protocol] ?? model.payable)
    : model.payable
}

export function displayedPricingCost(
  model: PricingModel,
  _mode: PricingDisplayMode,
  inputTokens: number,
  outputTokens: number,
  protocol: 'all' | 'responses' | 'messages' | 'chat_completions' = 'all'
): number {
  const selectedProtocol =
    protocol === 'all'
      ? defaultACUPricingProtocol(model.payable_by_protocol)
      : protocol
  const protocolPrice = contextPricingRates(
    selectedProtocol === undefined
      ? model.payable
      : (model.payable_by_protocol?.[selectedProtocol] ?? model.payable),
    inputTokens
  )
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
