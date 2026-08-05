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
// ----------------------------------------------------------------------------
// Pricing Types
// ----------------------------------------------------------------------------

export type PricingVendor = {
  id: number
  name: string
  icon?: string
  description?: string
}

export type PricingModel = {
  id: number
  model_name: string
  display_name?: string
  description?: string
  icon?: string
  vendor_id?: number
  vendor_name?: string
  vendor_icon?: string
  vendor_description?: string
  quota_type: number
  model_ratio: number
  completion_ratio: number
  model_price?: number
  cache_ratio?: number | null
  create_cache_ratio?: number | null
  image_ratio?: number | null
  audio_ratio?: number | null
  audio_completion_ratio?: number | null
  enable_groups: string[]
  tags?: string
  supported_endpoint_types?: string[]
  key?: string
  group_ratio?: Record<string, number>
  /** Billing mode (e.g. "tiered_expr") used to flag dynamic pricing */
  billing_mode?: string
  /** Raw expression describing dynamic / tiered billing */
  billing_expr?: string
  /** Pricing version returned by backend, useful for cache busting */
  pricing_version?: string
  input_price_per_million?: number
  output_price_per_million?: number
  cached_input_price_per_million?: number
  payable?: PricingPayable
  reference?: PricingReference
  acu_role?: string
  acu_protocol?: string
  acu_tool_call?: boolean
  acu_reasoning?: boolean
  acu_active?: boolean
  acu_status?: string
  pricing_label?: string
  pricing_description?: string
  price_currency?: 'CNY' | 'USD'
  price_semantics?: 'estimated_user_cash_cost' | string
  acu_effective_cost_status?: 'verified' | 'estimated'
  acu_curve_profile?: string
  acu_profile_confidence?: string
  acu_curve?: ACUCurvePoint[]
  /**
   * Optional model metadata fields reserved for backend-provided catalog data.
   * Keep them data-driven; do not synthesize display values on the client.
   */
  context_length?: number
  max_output_tokens?: number
  knowledge_cutoff?: string
  release_date?: string
  parameter_count?: string
  input_modalities?: Modality[]
  output_modalities?: Modality[]
  capabilities?: ModelCapability[]
}

export type PricingDisplayMode =
  | 'payable_only'
  | 'reference_only'
  | 'comparison'

export type PricingPayable = {
  input_cny_per_million: number
  output_cny_per_million: number
  cached_input_cny_per_million?: number
  status: 'verified' | 'estimated'
  pricing_policy_version: string
}

export type PricingReference = {
  input_cny_per_million: number
  output_cny_per_million: number
  cached_input_cny_per_million?: number
  source_type: 'official' | 'openrouter'
  source_name: string
  observed_at: string
  original_currency: 'USD' | 'CNY'
  fx_cny_per_usd?: number
}

export type ACUCurvePoint = {
  difficultyScore: number
  estimatedQuality: number
  qualityLower: number
  qualityUpper: number
}

/** Input/output modalities supported by a model. */
export type Modality = 'text' | 'image' | 'audio' | 'video' | 'file'

/** Functional capabilities a model exposes. */
export type ModelCapability =
  | 'function_calling'
  | 'streaming'
  | 'vision'
  | 'json_mode'
  | 'structured_output'
  | 'reasoning'
  | 'tools'
  | 'system_prompt'
  | 'web_search'
  | 'code_interpreter'
  | 'caching'
  | 'embeddings'

export type PricingData = {
  success: boolean
  message?: string
  data: PricingModel[]
  vendors: PricingVendor[]
  group_ratio: Record<string, number>
  usable_group: Record<string, { desc: string; ratio: number }>
  supported_endpoint: Record<string, string>
  auto_groups: string[]
  acu_catalog_version?: string
  acu_catalog_error?: string
  acu_pricing_display_mode?: PricingDisplayMode
  acu_curve_model_statuses?: Array<{
    modelId: string
    statuses: string[]
    healthyChannelCount: number
    effectiveCostStatuses: Array<'estimated' | 'verified'>
    temporarilyUnavailableReason?: string | null
  }>
  acu_curve_status_counts?: Record<string, number>
}

export type ACUSelectionCandidate = {
  candidateId: string
  modelId: string
  executionPresetId?: string
  reasoningEffort?: string
  estimatedQuality?: number
  estimatedCallCost?: number
  quality: number
  costCny: number
  valueUtility: number
  baseValueUtility?: number
  candidatePreferenceScore?: number
  candidatePreferenceMultiplier?: number
  adjustedValueUtility?: number
  selected?: boolean
  rawQualityUtility?: number
  rawCostUtility?: number
  qualitySatisfactionUtility?: number
  qualitySatisfactionVersion?: string
  normalizedQualityUtility?: number
  normalizedCostUtility?: number
  qualityContribution?: number
  costContribution?: number
  normalizationQualityRange?: number
  normalizationCostRange?: number
  normalizationQualityDenominator?: number
  normalizationCostDenominator?: number
  normalizationVersion?: string
  qualityUtility?: number
  costUtility?: number
  qualityWeight?: number
  costWeight?: number
  rank?: number
  formulaVersion?: string
}

export type ACUSelectionCorridorPoint = {
  difficulty: number
  selectedModelId: string
  selectedCandidateId?: string
  selectedExecutionPresetId?: string
  reasoningEffort?: string
  selectedQuality: number
  selectedCostCny: number
  effectiveQualityBias?: number
  qualityWeight?: number
  costWeight?: number
  selectedExecutionProfileId?: string
  selectedProvider?: string
  selectedProfileUtility?: number
  profileCandidateUtilities?: Array<{
    executionProfileId: string
    profileCost: number
    profileLatencyMs?: number
    costUtility: number
    speedUtility: number
    reliabilityUtility: number
    profileUtility: number
    rawCostUtility?: number
    rawSpeedUtility?: number
    rawReliabilityUtility?: number
    normalizedCostUtility?: number
    normalizedSpeedUtility?: number
    normalizedReliabilityUtility?: number
    costContribution?: number
    speedContribution?: number
    reliabilityContribution?: number
    normalizationVersion?: string
    rank: number
    selected: boolean
  }>
  qualityLower: number
  qualityUpper: number
  candidates: ACUSelectionCandidate[]
}

export type ACUExecutionPresetSeries = {
  candidateId: string
  modelId: string
  displayName: string
  executionPresetId: string
  reasoningEffort: string
  calibrationStatus: string
  expectedOutputTokenMultiplier: number
  estimatedOutputTokens: number
  points: Array<{
    difficulty: number
    estimatedQuality: number
    estimatedCallCost: number
  }>
}

export type ACUSelectionCorridor = {
  defaultPreference: 'economy' | 'balanced' | 'quality'
  formulaVersion: string
  routingUtilityVersion?: string
  resolvedQualityBias?: number
  supplyStrategy?:
    | 'lowest_cost'
    | 'balanced'
    | 'low_latency'
    | 'high_reliability'
  supplyWeights?: { cost: number; speed: number; reliability: number }
  generatedAt: string
  inputTokens: number
  expectedOutputTokens: number
  assumptions: Record<string, unknown>
  executionPresetSeries: ACUExecutionPresetSeries[]
  series: Record<
    'economy' | 'balanced' | 'quality',
    ACUSelectionCorridorPoint[]
  >
  effective?: ACUSelectionCorridorPoint[]
}

export type TokenUnit = 'M' | 'K'
export type PriceType =
  | 'input'
  | 'output'
  | 'cache'
  | 'create_cache'
  | 'image'
  | 'audio_input'
  | 'audio_output'
export type QuotaType = 0 | 1 // 0: token-based, 1: per-request
