/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
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
  mode: PricingDisplayMode,
  inputTokens: number,
  outputTokens: number
): number {
  const price = mode === 'reference_only' ? model.reference : model.payable
  return (
    estimatedPricingCost(
      price?.input_cny_per_million,
      price?.output_cny_per_million,
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

export function buildPricingBarSeries(mode: PricingDisplayMode) {
  const reference = {
    type: 'bar' as const,
    id: 'reference-price',
    dataIndex: 0,
    direction: 'horizontal' as const,
    xField: 'referenceCost',
    yField: 'modelName',
    barWidth: 14,
    barGap: '-100%',
    barMinHeight: 1,
    zIndex: 1,
    opacity: 0.16,
  }
  const payable = {
    type: 'bar' as const,
    id: 'payable-price',
    dataIndex: 0,
    direction: 'horizontal' as const,
    xField: 'payableCost',
    yField: 'modelName',
    barWidth: 8,
    barGap: '-100%',
    barMinHeight: 1,
    zIndex: 2,
    opacity: 1,
  }
  if (mode === 'payable_only') return [payable]
  if (mode === 'reference_only') return [reference]
  return [reference, payable]
}
