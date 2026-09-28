import type { ACUExecutionProfile } from '../api'

export type CostInputs = {
  inputTokens: string
  outputTokens: string
  cachedInputTokens: string
  cachedOutputTokens: string
}

export function estimateProfileCost(
  price: ACUExecutionProfile['billingPrice'],
  usage: CostInputs,
  accounting: 'includes_cached' | 'excludes_cached',
  multiplier: number,
  creditsPerCny: number,
  markup: number
): {
  nominalCostUsd?: number
  platformDebitCredits?: number
  providerCostCny?: number
  userChargeCny?: number
} {
  if (!price) return {}
  const counts = [
    usage.inputTokens,
    usage.outputTokens,
    usage.cachedInputTokens,
    usage.cachedOutputTokens,
  ].map(Number)
  if (counts.some((value) => !Number.isFinite(value) || value < 0)) return {}
  const [input, output, cached, write] = counts
  if (accounting === 'includes_cached' && cached > input) return {}
  const uncached = accounting === 'includes_cached' ? input - cached : input
  const components = [
    [uncached, price.inputPricePerMillion],
    [output, price.outputPricePerMillion],
    [cached, price.cachedInputPricePerMillion],
    [write, price.cacheWritePricePerMillion],
  ]
  let nominalCostUsd = 0
  for (const [count, rate] of components) {
    if (!count) continue
    if (rate === undefined || !Number.isFinite(rate) || rate < 0) return {}
    nominalCostUsd += (count * rate) / 1_000_000
  }
  if (!Number.isFinite(nominalCostUsd)) return {}
  if (!Number.isFinite(multiplier) || multiplier <= 0) return { nominalCostUsd }
  const platformDebitCredits = nominalCostUsd * multiplier
  if (!Number.isFinite(platformDebitCredits)) return { nominalCostUsd }
  if (!Number.isFinite(creditsPerCny) || creditsPerCny <= 0) {
    return { nominalCostUsd, platformDebitCredits }
  }
  const providerCostCny = platformDebitCredits / creditsPerCny
  if (!Number.isFinite(providerCostCny)) {
    return { nominalCostUsd, platformDebitCredits }
  }
  const userChargeCny = providerCostCny * markup
  return {
    nominalCostUsd,
    platformDebitCredits,
    providerCostCny,
    userChargeCny:
      Number.isFinite(userChargeCny) && markup > 0 ? userChargeCny : undefined,
  }
}
